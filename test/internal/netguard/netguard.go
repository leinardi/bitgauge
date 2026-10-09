//go:build image || harness

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

// Package netguard owns the network namespace BitGauge runs in during the image test and the
// accuracy harness, and counts every packet that tries to leave it (testing.md section 5).
//
// A holder container from the tools image starts on a Docker network with no route out. Before
// anything else joins its namespace it installs nftables counters on the output hook, adds a sink
// dummy interface with IPv4 and IPv6 default routes so that every non-local destination is
// routable -- a packet then reaches the hook and is counted and dropped, instead of connect()
// failing with "network unreachable" before any hook sees it -- runs four negative controls that
// must each increment their counter, and resets the counters. BitGauge then joins with
// --network container:<holder>, so its traffic is observed from process start.
//
// The claim is no packet egress. An attempt that fails before a packet is built is invisible
// here; the image test's syscall layer is what sees those.
package netguard

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/leinardi/bitgauge/test/internal/testenv"
)

// The named counters.
const (
	// Egress counts new connections on any interface but loopback.
	Egress = "egress"
	// DNS counts loopback traffic to Docker's embedded DNS, 127.0.0.11:53. BitGauge does no
	// lookups.
	DNS = "dns"
	// Loopback counts new loopback connections other than to the listen port.
	Loopback = "loopback"

	table        = "netguard"
	controlPort  = "9"
	toolsRepo    = "bitgauge-test-tools"
	toolsContext = "test/harness"
	toolsFile    = "test/harness/tools.Dockerfile"
)

var (
	// ErrInstrumentBlind reports a negative control that did not increment its counter: the
	// guard would not have seen the traffic it exists to see.
	ErrInstrumentBlind = errors.New("instrument blind")
	errCounters        = errors.New("unreadable nft counters")
)

// Counters are the packet counts of the three named counters.
type Counters map[string]uint64

// Zero reports whether no counter has counted anything.
func (c Counters) Zero() bool {
	for _, packets := range c {
		if packets != 0 {
			return false
		}
	}

	return true
}

// Options configures one guard.
type Options struct {
	// ToolsImage is the image BuildToolsImage returned.
	ToolsImage string
	// Network is the --internal network the holder starts on.
	Network string
	// ListenPort is BitGauge's listen port, the one loopback destination that is not counted:
	// the healthcheck connects to it.
	ListenPort uint16

	// withoutSinkRoutes leaves the sink without default routes: the negative test that shows the
	// controls catch a guard that cannot see.
	withoutSinkRoutes bool
}

// Guard is a prepared holder whose namespace BitGauge can join.
type Guard struct {
	// Name is the holder container's name.
	Name string
	env  *testenv.Env
}

// NetworkMode is the --network value that joins the guard's namespace.
func (g *Guard) NetworkMode() string {
	return "container:" + g.Name
}

// BuildToolsImage builds test/harness/tools.Dockerfile, tagged by a hash of the file so a changed
// Dockerfile is never answered by a stale image, and returns the tag.
func BuildToolsImage(ctx context.Context, runner testenv.Runner, repoRoot string) (string, error) {
	content, err := os.ReadFile(filepath.Join(repoRoot, toolsFile))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", toolsFile, err)
	}

	sum := sha256.Sum256(content)
	tag := toolsRepo + ":" + hex.EncodeToString(sum[:])[:16]

	_, err = runner.Run(
		ctx,
		"build",
		"--quiet",
		"--tag",
		tag,
		"--file",
		filepath.Join(repoRoot, toolsFile),
		filepath.Join(repoRoot, toolsContext),
	)
	if err != nil {
		return "", fmt.Errorf("build the tools image: %w", err)
	}

	return tag, nil
}

// Start brings a holder up on opts.Network and prepares it: rules, sink, controls, reset. On an
// error the holder is left to the environment's cleanup.
func Start(ctx context.Context, env *testenv.Env, opts Options) (*Guard, error) {
	guard := &Guard{Name: env.Name("netguard"), env: env}

	_, err := env.Docker(ctx, "run", "--detach", "--name", guard.Name,
		"--network", opts.Network,
		"--cap-drop", "ALL", "--cap-add", "NET_ADMIN",
		// Docker disables IPv6 in a container on a network without it; the IPv6 control needs it.
		"--sysctl", "net.ipv6.conf.all.disable_ipv6=0",
		opts.ToolsImage, "sleep", "infinity")
	if err != nil {
		return nil, fmt.Errorf("start the holder: %w", err)
	}

	// One command per line, split on spaces: nft and ip join their arguments back into one
	// statement. Priority -150 puts the chain after conntrack (-200), so ct state is known, and
	// before Docker's DNAT of 127.0.0.11:53 (-100), so the DNS destination is still the original.
	setup := []string{
		"nft add table inet " + table,
		"nft add counter inet " + table + " " + Egress,
		"nft add counter inet " + table + " " + DNS,
		"nft add counter inet " + table + " " + Loopback,
		"nft add chain inet " + table + " output { type filter hook output priority -150 ; policy accept ; }",
		"nft add rule inet " + table + ` output oifname != "lo" ct state new counter name ` + Egress + " drop",
		"nft add rule inet " + table + ` output oifname "lo" ip daddr 127.0.0.11 meta l4proto { tcp, udp } th dport 53 counter name ` +
			DNS + " accept",
		"nft add rule inet " + table + ` output oifname "lo" ct state new tcp dport ` +
			strconv.Itoa(int(opts.ListenPort)) + " accept",
		"nft add rule inet " + table + ` output oifname "lo" ct state new counter name ` + Loopback,
		"ip link add sink type dummy",
		"ip link set sink up",
	}

	if !opts.withoutSinkRoutes {
		setup = append(setup, "ip route add default dev sink", "ip -6 route add default dev sink")
	}

	for _, command := range setup {
		_, err = guard.exec(ctx, strings.Fields(command)...)
		if err != nil {
			return nil, fmt.Errorf("prepare the holder: %w", err)
		}
	}

	err = guard.runControls(ctx, opts.ListenPort)
	if err != nil {
		return nil, err
	}

	err = guard.Reset(ctx)
	if err != nil {
		return nil, err
	}

	return guard, nil
}

// control is one negative control: a command run inside the namespace, and the counter it must
// increment.
type control struct {
	name    string
	counter string
	command []string
}

func controls(listenPort uint16) []control {
	port := controlPort
	if strconv.Itoa(int(listenPort)) == port {
		port = "10"
	}

	tcp := func(address string) []string {
		return []string{
			"iperf3",
			"--client",
			address,
			"--port",
			port,
			"--connect-timeout",
			"500",
			"--time",
			"1",
		}
	}

	return []control{
		{"TCP to a routed TEST-NET address", Egress, tcp("192.0.2.1")},
		{"TCP to an otherwise unroutable IPv6 address", Egress, tcp("2001:db8::1")},
		{
			"a DNS lookup through the embedded DNS",
			DNS,
			[]string{"nslookup", "netguard.invalid", "127.0.0.11"},
		},
		{"TCP to an unused loopback port", Loopback, tcp("127.0.0.1")},
	}
}

// Counters reads the three counters.
func (g *Guard) Counters(ctx context.Context) (Counters, error) {
	out, err := g.exec(ctx, "nft", "--json", "list", "counters", "table", "inet", table)
	if err != nil {
		return nil, fmt.Errorf("read the counters: %w", err)
	}

	var listing struct {
		Nftables []map[string]json.RawMessage `json:"nftables"`
	}

	err = json.Unmarshal([]byte(out), &listing)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errCounters, err)
	}

	counters := Counters{}

	for _, entry := range listing.Nftables {
		raw, ok := entry["counter"]
		if !ok {
			continue
		}

		var counter struct {
			Name    string `json:"name"`
			Packets uint64 `json:"packets"`
		}

		err = json.Unmarshal(raw, &counter)
		if err != nil {
			return nil, fmt.Errorf("%w: %w", errCounters, err)
		}

		counters[counter.Name] = counter.Packets
	}

	for _, name := range []string{Egress, DNS, Loopback} {
		if _, ok := counters[name]; !ok {
			return nil, fmt.Errorf("%w: no %s counter in %s", errCounters, name, out)
		}
	}

	return counters, nil
}

// Reset zeroes the counters.
func (g *Guard) Reset(ctx context.Context) error {
	_, err := g.exec(ctx, "nft", "reset", "counters", "table", "inet", table)
	if err != nil {
		return fmt.Errorf("reset the counters: %w", err)
	}

	return nil
}

// Exec runs a command inside the guard's namespace, from the holder.
func (g *Guard) Exec(ctx context.Context, command ...string) (string, error) {
	return g.exec(ctx, command...)
}

func (g *Guard) exec(ctx context.Context, command ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()

	out, err := g.env.Docker(ctx, append([]string{"exec", g.Name}, command...)...)
	if err != nil {
		return out, fmt.Errorf("%v in the holder: %w", command, err)
	}

	return out, nil
}

// runControls runs each control on zeroed counters and fails as instrument blind when one leaves
// its counter at zero.
func (g *Guard) runControls(ctx context.Context, listenPort uint16) error {
	for _, check := range controls(listenPort) {
		err := g.Reset(ctx)
		if err != nil {
			return err
		}

		// The control is expected to fail -- nothing answers -- so only the counter says
		// whether it was seen.
		_, _ = g.exec(ctx, check.command...)

		counters, err := g.Counters(ctx)
		if err != nil {
			return err
		}

		if counters[check.counter] == 0 {
			return fmt.Errorf(
				"%w: %s did not increment the %s counter",
				ErrInstrumentBlind,
				check.name,
				check.counter,
			)
		}
	}

	return nil
}
