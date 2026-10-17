//go:build harness

/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

package harness

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/leinardi/bitgauge/test/internal/netguard"
	"github.com/leinardi/bitgauge/test/internal/testenv"
)

const (
	listenPort  = 8080
	iperf3Port  = "5201"
	selfTestFor = 5 * time.Second
	// selfTestTail keeps iperf3 running past the self-test's last tbf read.
	selfTestTail = time.Second
	// SelfTestBound is how far the measured rate may stray from the configured one before a
	// profile does not count (testing.md section 5.1).
	SelfTestBound = 0.05
	clientWeb     = "/web"
	clientOut     = "/out"
	browserLimit  = 20 * time.Minute
	pingInterval  = "0.2"
	pollInterval  = 200 * time.Millisecond
)

// ErrShaperSelfTest reports a shaped link that does not hold its configured rate.
var ErrShaperSelfTest = errors.New("shaper self-test failed")

// Config is what every topology of one harness invocation shares.
type Config struct {
	// ToolsImage is the image netguard.BuildToolsImage built.
	ToolsImage string
	// BitGaugeImage is the shipped image, built from deployments/docker/Dockerfile.
	BitGaugeImage string
	// RepoRoot is the repository root; web/ is mounted into the client from there.
	RepoRoot string
	// OutDir receives the browsers' exports and Playwright's output; the client writes it. It
	// must exist, owned by the user running the harness, before Up.
	OutDir string
	// Unshaped skips the shaper even on a shaped profile (HARNESS_SHAPE=none).
	Unshaped bool
}

// Topology is one profile's containers (testing.md section 5.1): an internal network with no route
// out; the netguard holder owning BitGauge's namespace, which BitGauge (read-only) and the iperf3
// server join; an optional proxy; and the Playwright client, whose namespace the shaper sidecar
// shares and shapes.
type Topology struct {
	env     *testenv.Env
	cfg     Config
	profile Profile
	guard   *netguard.Guard
	network string
	client  string
	shaper  string
	// proxy is the proxy's container, empty without one.
	proxy string
	// selfTest is the measurement the shaper self-test judged.
	selfTest *Throughput
	// URL is where the browser opens BitGauge, through the proxy when there is one.
	URL string
}

// Up builds the topology for one profile. A failed step returns an error; the environment's
// cleanup removes whatever was created. Once netguard has started, a failed Up still returns the
// partial topology, so the run can read the guard's counters and whatever self-test was measured.
func Up(ctx context.Context, env *testenv.Env, cfg Config, profile *Profile) (*Topology, error) {
	topology := &Topology{env: env, cfg: cfg, profile: *profile, network: env.Name("net")}

	_, err := env.Docker(ctx, "network", "create", "--internal", topology.network)
	if err != nil {
		return nil, fmt.Errorf("create the network: %w", err)
	}

	topology.guard, err = netguard.Start(ctx, env, netguard.Options{
		ToolsImage: cfg.ToolsImage, Network: topology.network, ListenPort: listenPort,
	})
	if err != nil {
		return nil, fmt.Errorf("start netguard: %w", err)
	}

	steps := []func(context.Context) error{
		topology.startBitGauge,
		topology.startIperf3Server,
		topology.startProxy,
		topology.startClient,
		topology.startShaper,
	}

	for _, step := range steps {
		err = step(ctx)
		if err != nil {
			return topology, err
		}
	}

	return topology, nil
}

// Guard returns the netguard holder whose counters the run reads at the end.
func (t *Topology) Guard() *netguard.Guard {
	return t.guard
}

// Shaped reports whether this run shapes the client's link.
func (t *Topology) Shaped() bool {
	return t.profile.Shaped && !t.cfg.Unshaped
}

// SelfTest holds the tbf rates the shaper self-test held to SelfTestBound, nil on an unshaped run
// or when the self-test never measured.
func (t *Topology) SelfTest() *Throughput {
	return t.selfTest
}

// ClientCounters reads the client container's cgroup: total CPU time in microseconds and the
// memory peak in bytes.
func (t *Topology) ClientCounters(ctx context.Context) (cpuMicros, peakBytes uint64, err error) {
	cpuStat, err := t.exec(ctx, t.client, "cat", cgroupCPUStat)
	if err != nil {
		return 0, 0, fmt.Errorf("read the client's cpu.stat: %w", err)
	}

	cpuMicros, err = cpuUsageMicros(cpuStat)
	if err != nil {
		return 0, 0, err
	}

	peak, err := t.exec(ctx, t.client, "cat", cgroupMemoryPeak)
	if err != nil {
		return 0, 0, fmt.Errorf("read the client's memory.peak: %w", err)
	}

	peakBytes, err = memoryPeak(peak)
	if err != nil {
		return 0, 0, err
	}

	return cpuMicros, peakBytes, nil
}

// Iperf3 measures the client's path to the iperf3 server beside BitGauge, upload then download,
// each for duration after the settle that the result leaves out (Iperf3Settle), with blocks sized
// to the profile's rate (Iperf3Length); the receiver's intervals give the rate.
func (t *Topology) Iperf3(ctx context.Context, duration time.Duration) (*Throughput, error) {
	// An unshaped run has neither the profile's round trip nor its rate.
	var (
		rate int64
		rtt  time.Duration
	)

	if t.Shaped() {
		rate, rtt = t.profile.RateBitsPerSecond, t.profile.RTT
	}

	settle := Iperf3Settle(rtt)
	seconds := strconv.Itoa(int(math.Ceil((settle + duration).Seconds())))
	length := strconv.FormatInt(Iperf3Length(rate), 10)
	result := &Throughput{Seconds: duration.Seconds()}

	for _, reverse := range []bool{false, true} {
		args := []string{
			"iperf3", "--client", t.guard.Name, "--port", iperf3Port,
			"--time", seconds, "--length", length, "--get-server-output", "--json",
		}
		if reverse {
			args = append(args, "--reverse")
		}

		out, err := t.exec(ctx, t.shaper, args...)
		if err != nil {
			return nil, fmt.Errorf("iperf3: %w", err)
		}

		received, err := receivedBitsPerSecond(out, reverse, settle)
		if err != nil {
			return nil, err
		}

		if reverse {
			result.DownloadBitsPerSecond = received
		} else {
			result.UploadBitsPerSecond = received
		}
	}

	return result, nil
}

// Browse runs one browser through the preset with the harness driver, with an ICMP ping to the
// server running alongside from the client's namespace. The driver writes the export and its phase
// transitions into ArtifactsFor's paths; Browse returns the ping's full output, each reply with
// its wall-clock time (-D), which the loaded-latency rule places in those phases.
func (t *Topology) Browse(ctx context.Context, browser string) (ping string, err error) {
	exportDir := filepath.Dir(ArtifactsFor(t.profile.Name, browser).Export)
	ignoreHTTPS := "0"

	if t.profile.Proxy == ProxyCaddy {
		ignoreHTTPS = "1"
	}

	pingDone := make(chan string, 1)

	go func() {
		out, _ := t.exec(ctx, t.shaper, "ping", "-D", "-i", pingInterval,
			"-w", strconv.Itoa(int(browserLimit.Seconds())), t.guard.Name)
		pingDone <- out
	}()

	browseCtx, cancel := context.WithTimeout(ctx, browserLimit)
	defer cancel()

	_, err = t.env.Docker(
		browseCtx,
		"exec",
		"--env",
		"BITGAUGE_HARNESS_URL="+t.URL,
		"--env",
		"HARNESS_PRESET="+t.profile.Preset,
		"--env",
		"HARNESS_EXPORT_DIR="+clientOut+"/"+exportDir,
		"--env",
		"HARNESS_OUTPUT_DIR="+clientOut+"/playwright/"+t.profile.Name+"-"+browser,
		"--env",
		"HARNESS_IGNORE_HTTPS_ERRORS="+ignoreHTTPS,
		t.client,
		"npx",
		"--no-install",
		"playwright",
		"test",
		"--config",
		"playwright.harness.config.ts",
		"--project",
		browser,
	)

	// SIGINT makes ping print its summary and exit; the goroutine then returns its whole output.
	_, _ = t.exec(ctx, t.shaper, "pkill", "-INT", "ping")

	ping = <-pingDone

	if err != nil {
		return ping, fmt.Errorf("the %s run: %w", browser, err)
	}

	return ping, nil
}

func (t *Topology) startBitGauge(ctx context.Context) error {
	_, err := t.env.Docker(ctx, "run", "--detach", "--name", t.env.Name("bitgauge"),
		"--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--network", t.guard.NetworkMode(),
		t.cfg.BitGaugeImage)
	if err != nil {
		return fmt.Errorf("start BitGauge: %w", err)
	}

	// Up only once it answers, from inside its own namespace.
	return poll(ctx, func() error {
		_, probeErr := t.guard.Exec(
			ctx,
			"wget",
			"-q",
			"-O",
			"/dev/null",
			"http://127.0.0.1:"+strconv.Itoa(listenPort)+"/api/v1/info",
		)
		if probeErr != nil {
			return fmt.Errorf("probe /api/v1/info: %w", probeErr)
		}

		return nil
	})
}

// startIperf3Server joins the guard's namespace, so the reference measures the same endpoint the
// browser does. It reports in JSON, which --get-server-output hands to the client for upload.
func (t *Topology) startIperf3Server(ctx context.Context) error {
	_, err := t.env.Docker(ctx, "run", "--detach", "--name", t.env.Name("iperf3"),
		"--cap-drop", "ALL", "--network", t.guard.NetworkMode(),
		t.cfg.ToolsImage, "iperf3", "--server", "--port", iperf3Port, "--json")
	if err != nil {
		return fmt.Errorf("start the iperf3 server: %w", err)
	}

	return nil
}

func (t *Topology) startProxy(ctx context.Context) error {
	upstream := "http://" + t.guard.Name + ":" + strconv.Itoa(listenPort)
	t.proxy = t.env.Name("proxy")
	proxy := t.proxy
	configs := filepath.Join(t.cfg.RepoRoot, "test", "harness", "proxies")

	switch t.profile.Proxy {
	case ProxyNone:
		t.proxy = ""
		t.URL = upstream

		return nil
	case ProxyTraefik:
		_, err := t.env.Docker(
			ctx,
			"run",
			"--detach",
			"--name",
			proxy,
			"--network",
			t.network,
			"--cap-drop",
			"ALL",
			"--env",
			"BITGAUGE_UPSTREAM="+upstream,
			"--mount",
			bindMount(
				filepath.Join(configs, "traefik", "traefik.yaml"),
				"/etc/traefik/traefik.yaml",
				true,
			),
			"--mount",
			bindMount(
				filepath.Join(configs, "traefik", "dynamic.yaml"),
				"/etc/traefik/dynamic.yaml",
				true,
			),
			TraefikImage,
		)
		if err != nil {
			return fmt.Errorf("start Traefik: %w", err)
		}

		port := "8081"
		if t.profile.WebSocketBlocked {
			port = "8082"
		}

		t.URL = "http://" + proxy + ":" + port
	case ProxyCaddy:
		_, err := t.env.Docker(
			ctx,
			"run",
			"--detach",
			"--name",
			proxy,
			"--network",
			t.network,
			"--cap-drop",
			"ALL",
			"--cap-add",
			"NET_BIND_SERVICE",
			"--env",
			"BITGAUGE_UPSTREAM="+upstream,
			"--env",
			"BITGAUGE_PROXY_HOST="+proxy,
			"--mount",
			bindMount(filepath.Join(configs, "caddy", "Caddyfile"), "/etc/caddy/Caddyfile", true),
			CaddyImage,
		)
		if err != nil {
			return fmt.Errorf("start Caddy: %w", err)
		}

		t.URL = "https://" + proxy + ":8443"
	}

	return nil
}

// startClient starts the Playwright image idle, so the shaper can join and shape its namespace
// before the browser makes a single request. web/ is mounted read-only from the host, with the
// node_modules npm ci installed there: the client has no route out to install anything.
func (t *Topology) startClient(ctx context.Context) error {
	t.client = t.env.Name("client")

	_, err := t.env.Docker(ctx, "run", "--detach", "--name", t.client, "--network", t.network,
		"--cap-drop", "ALL",
		"--user", strconv.Itoa(os.Getuid())+":"+strconv.Itoa(os.Getgid()),
		"--env", "HOME=/tmp",
		"--mount", bindMount(filepath.Join(t.cfg.RepoRoot, "web"), clientWeb, true),
		"--mount", bindMount(t.cfg.OutDir, clientOut, false),
		"--workdir", clientWeb,
		PlaywrightImage, "sleep", "infinity")
	if err != nil {
		return fmt.Errorf("start the client: %w", err)
	}

	return nil
}

// startShaper shapes the client's link: netem delay with a tbf child on egress, and the same tbf on
// an ifb device that ingress is mirrored to; the self-test runs on that link, then netem gains the
// profile's loss. Every tc command must succeed; there is never a silently unshaped run.
func (t *Topology) startShaper(ctx context.Context) error {
	t.shaper = t.env.Name("shaper")

	// The shaper also runs the iperf3 client and the ping, from the client's namespace, so they
	// take the browser's path.
	_, err := t.env.Docker(ctx, "run", "--detach", "--name", t.shaper,
		"--network", "container:"+t.client,
		"--cap-drop", "ALL", "--cap-add", "NET_ADMIN", "--cap-add", "NET_RAW",
		t.cfg.ToolsImage, "sleep", "infinity")
	if err != nil {
		return fmt.Errorf("start the shaper: %w", err)
	}

	if !t.Shaped() {
		return nil
	}

	for _, command := range ShaperCommands(&t.profile) {
		_, err = t.exec(ctx, t.shaper, strings.Fields(command)...)
		if err != nil {
			return fmt.Errorf("shape the link (%s): %w", command, err)
		}
	}

	err = t.capSenderOffload(ctx)
	if err != nil {
		return err
	}

	err = t.checkShaper(ctx)
	if err != nil {
		return err
	}

	loss := LossCommand(&t.profile)
	if loss == "" {
		return nil
	}

	_, err = t.exec(ctx, t.shaper, strings.Fields(loss)...)
	if err != nil {
		return fmt.Errorf("add the loss (%s): %w", loss, err)
	}

	return nil
}

// capSenderOffload runs OffloadCommand, where CapsOffload holds, in the namespace that sends to the
// client: BitGauge's,
// through the netguard holder, or the proxy's, through a one-shot tools container joining it, since
// the proxies run without NET_ADMIN. A connection takes the cap when it opens, and every connection
// of the run opens after this.
func (t *Topology) capSenderOffload(ctx context.Context) error {
	if !CapsOffload(&t.profile) {
		return nil
	}

	command := strings.Fields(OffloadCommand)
	if t.proxy == "" {
		_, err := t.exec(ctx, t.guard.Name, command...)
		if err != nil {
			return fmt.Errorf("cap BitGauge's segmentation offload (%s): %w", OffloadCommand, err)
		}

		return nil
	}

	args := append([]string{
		"run", "--rm", "--network", "container:" + t.proxy,
		"--cap-drop", "ALL", "--cap-add", "NET_ADMIN",
		t.cfg.ToolsImage,
	}, command...)

	_, err := t.env.Docker(ctx, args...)
	if err != nil {
		return fmt.Errorf("cap the proxy's segmentation offload (%s): %w", OffloadCommand, err)
	}

	return nil
}

// checkShaper is the shaper self-test (testing.md section 5.1): before any loss is added, it reads
// the rate each direction's tbf sends while iperf3 saturates that direction, and refuses a profile
// whose rate is off the configured one by more than SelfTestBound. The eth0 tbf meters upload, the
// ifb0 tbf download.
func (t *Topology) checkShaper(ctx context.Context) error {
	upload, err := t.tbfRate(ctx, "eth0", false)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrShaperSelfTest, err)
	}

	download, err := t.tbfRate(ctx, "ifb0", true)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrShaperSelfTest, err)
	}

	t.selfTest = &Throughput{
		DownloadBitsPerSecond: download,
		UploadBitsPerSecond:   upload,
		Seconds:               selfTestFor.Seconds(),
	}
	want := float64(t.profile.RateBitsPerSecond)

	for direction, got := range map[string]float64{"download": download, "upload": upload} {
		if math.Abs(got-want)/want > SelfTestBound {
			return fmt.Errorf(
				"%w: the %s tbf sent %.0f bit/s against a configured rate of %.0f",
				ErrShaperSelfTest,
				direction,
				got,
				want,
			)
		}
	}

	return nil
}

// tbfRate runs iperf3 in one direction and reads the bytes the device's tbf sends over
// selfTestFor, from the settle on, while iperf3 keeps the link saturated. Each read is timed at
// the middle of its tc call.
func (t *Topology) tbfRate(ctx context.Context, device string, reverse bool) (float64, error) {
	settle := Iperf3Settle(t.profile.RTT)
	seconds := strconv.Itoa(int(math.Ceil((settle + selfTestFor + selfTestTail).Seconds())))
	args := []string{
		"iperf3", "--client", t.guard.Name, "--port", iperf3Port, "--time", seconds,
		"--length", strconv.FormatInt(Iperf3Length(t.profile.RateBitsPerSecond), 10),
	}

	if reverse {
		args = append(args, "--reverse")
	}

	iperfCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	done := make(chan error, 1)

	go func() {
		_, err := t.exec(iperfCtx, t.shaper, args...)
		done <- err
	}()

	first, firstAt, err := t.tbfSentAfter(ctx, device, settle)
	if err != nil {
		return 0, err
	}

	last, lastAt, err := t.tbfSentAfter(ctx, device, selfTestFor-time.Since(firstAt))
	if err != nil {
		return 0, err
	}

	err = <-done
	if err != nil {
		return 0, fmt.Errorf("iperf3: %w", err)
	}

	return float64(last-first) * bitsPerByte / lastAt.Sub(firstAt).Seconds(), nil
}

// tbfSentAfter waits, then reads the bytes the device's tbf has sent and when.
func (t *Topology) tbfSentAfter(
	ctx context.Context,
	device string,
	wait time.Duration,
) (int64, time.Time, error) {
	select {
	case <-ctx.Done():
		return 0, time.Time{}, fmt.Errorf("wait for the tbf read: %w", ctx.Err())
	case <-time.After(wait):
	}

	before := time.Now()

	out, err := t.exec(ctx, t.shaper, "tc", "-s", "qdisc", "show", "dev", device)
	if err != nil {
		return 0, time.Time{}, err
	}

	readAt := before.Add(time.Since(before) / 2)

	sent, err := TbfSentBytes(out)
	if err != nil {
		return 0, time.Time{}, err
	}

	return sent, readAt, nil
}

// exec runs a command in one of the topology's containers.
func (t *Topology) exec(ctx context.Context, container string, command ...string) (string, error) {
	out, err := t.env.Docker(ctx, append([]string{"exec", container}, command...)...)
	if err != nil {
		return out, fmt.Errorf("exec in %s: %w", container, err)
	}

	return out, nil
}

// bindMount is a --mount bind, which refuses a missing source where --volume would have the daemon
// create it, root-owned.
func bindMount(source, target string, readOnly bool) string {
	mount := "type=bind,source=" + source + ",target=" + target
	if readOnly {
		mount += ",readonly"
	}

	return mount
}

// poll retries check every pollInterval for up to a minute.
func poll(ctx context.Context, check func() error) error {
	deadline := time.Now().Add(time.Minute)

	for {
		err := check()
		if err == nil {
			return nil
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("still failing after a minute: %w", err)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("waiting: %w", ctx.Err())
		case <-time.After(pollInterval):
		}
	}
}
