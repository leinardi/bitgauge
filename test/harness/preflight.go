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
	"strconv"
	"strings"
	"time"
)

const (
	// daemonCgroupsFormat asks docker info for the cgroup driver and version, tab-separated.
	daemonCgroupsFormat = "{{.CgroupDriver}}\t{{.CgroupVersion}}"
	cgroupRoot          = "/sys/fs/cgroup"
	// ShapingModules are the kernel modules the shaper's tc and ip commands need, which a
	// container cannot load.
	ShapingModules = "ifb sch_netem sch_tbf sch_fq_codel sch_ingress cls_u32 act_mirred"
	probeTeardown  = 2 * time.Minute
	// probeArgs counts the words of a probe's docker run besides its extra flags.
	probeArgs = 13

	// docker CLI words the topology uses too.
	dockerRun   = "run"
	flagNetwork = "--network"
	flagCapDrop = "--cap-drop"
)

// The preflight selections of HARNESS_PREFLIGHT.
const (
	// PreflightAccounting probes the cgroup accounting only.
	PreflightAccounting = "accounting"
	// PreflightShaping probes the shaper's commands only.
	PreflightShaping = "shaping"
)

var (
	// ErrCgroupAccounting reports a daemon whose containers' cgroup counters would not be the
	// client's own.
	ErrCgroupAccounting = errors.New("per-container cgroup accounting is unreliable")
	// ErrShaping reports a host whose kernel cannot shape the client's link.
	ErrShaping = errors.New("the shaper's kernel facilities are missing")

	errUnknownPreflight = errors.New("unknown preflight")
)

// Docker runs one docker CLI command and returns its standard output; testenv.DockerCLI is one.
type Docker interface {
	Run(ctx context.Context, args ...string) (string, error)
}

// ProbeEnv is the environment the probe's containers live in, labeling what they create;
// testenv.Env is one.
type ProbeEnv interface {
	Docker(ctx context.Context, args ...string) (string, error)
	Name(base string) string
}

// UpProbe brings up the probe's environment and returns it with the function that removes it.
type UpProbe func(ctx context.Context) (env ProbeEnv, down func(context.Context) error, err error)

// CheckDaemonCgroups reads the daemon's own claim about its cgroups and refuses one without a
// cgroup driver (a rootless daemon without cgroups) or without cgroup v2. It builds and starts
// nothing, so a tier run can refuse before any build; the probe of Preflight has the last word.
func CheckDaemonCgroups(ctx context.Context, runner Docker) error {
	out, err := runner.Run(ctx, "info", "--format", daemonCgroupsFormat)
	if err != nil {
		return fmt.Errorf("%w: read the daemon's cgroup driver: %w", ErrCgroupAccounting, err)
	}

	return judgeDaemonCgroups(out)
}

func judgeDaemonCgroups(out string) error {
	driver, version, found := strings.Cut(strings.TrimRight(out, "\r\n"), "\t")

	switch {
	case !found:
		return fmt.Errorf("%w: unreadable docker info answer %q", ErrCgroupAccounting, out)
	case driver == "none" || driver == "":
		return fmt.Errorf(
			"%w: the daemon reports cgroup driver %q (rootless without cgroups?), so a container's "+
				"cgroup counters would be the daemon's, not the client's",
			ErrCgroupAccounting,
			driver,
		)
	case version != "2":
		return fmt.Errorf(
			"%w: the daemon reports cgroup version %q, and the client's cpu.stat and memory.peak "+
				"need cgroup v2",
			ErrCgroupAccounting,
			version,
		)
	}

	return nil
}

// PreflightOptions selects what Preflight probes.
type PreflightOptions struct {
	// ToolsImage is the image netguard.BuildToolsImage built; the probe runs it.
	ToolsImage string
	// Cgroups probes the cgroup accounting the client's CPU and memory come from.
	Cgroups bool
	// Shaped is the profile whose shaper commands the probe runs, nil on an unshaped run.
	Shaped *Profile
}

// Preflight probes the daemon with containers of its own environment, which it removes before it
// returns, whatever the outcome, so nothing of it is left while anything is measured.
//
// With Cgroups, a container in the client's mode (a private cgroup namespace) must be the cgroup a
// second container, in the host's cgroup namespace, finds under the first one's ID: the same
// directory by inode, since under a private namespace every container sees itself at the root,
// whether that root is its own cgroup or the daemon's. That cgroup's cpu.stat and memory.peak
// must read. With Shaped, the client-mode container gets an eth0 of its own and runs the profile's
// shaper and loss commands, as the shaper will.
func Preflight(ctx context.Context, upProbe UpProbe, opts PreflightOptions) (err error) {
	env, down, err := upProbe(ctx)
	if err != nil {
		return fmt.Errorf("preflight: %w", err)
	}

	defer func() {
		downCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), probeTeardown)
		defer cancel()

		downErr := down(downCtx)
		if downErr != nil {
			err = errors.Join(err, fmt.Errorf("remove the preflight probe: %w", downErr))
		}
	}()

	probe := &probe{env: env, image: opts.ToolsImage}

	err = probe.startClient(ctx, opts.Shaped != nil)
	if err != nil {
		return err
	}

	if opts.Cgroups {
		err = probe.checkCgroups(ctx)
		if err != nil {
			return err
		}
	}

	if opts.Shaped != nil {
		return probe.checkShaping(ctx, opts.Shaped)
	}

	return nil
}

// probe is Preflight's containers.
type probe struct {
	env   ProbeEnv
	image string
	// client is the client-mode container's full ID.
	client string
}

// startClient starts the client-mode container: a private cgroup namespace and the shaper's
// capabilities, on a network of its own when it shapes, so it has an eth0, and on none otherwise.
func (p *probe) startClient(ctx context.Context, shaped bool) error {
	network := "none"

	if shaped {
		network = p.env.Name("preflight-net")

		_, err := p.env.Docker(ctx, "network", "create", "--internal", network)
		if err != nil {
			return fmt.Errorf("preflight: create the network: %w", err)
		}
	}

	id, err := p.start(ctx, "preflight-client", network, "private", "--cap-add", "NET_ADMIN")
	if err != nil {
		return err
	}

	p.client = id

	return nil
}

// start runs one idle probe container and returns its full ID.
func (p *probe) start(
	ctx context.Context,
	base, network, cgroupns string,
	extra ...string,
) (string, error) {
	args := make([]string, 0, probeArgs+len(extra))
	args = append(args,
		dockerRun, "--detach", "--name", p.env.Name(base), flagNetwork, network,
		"--cgroupns", cgroupns, flagCapDrop, "ALL")
	args = append(args, extra...)
	args = append(args, p.image, "sleep", "infinity")

	out, err := p.env.Docker(ctx, args...)
	if err != nil {
		return "", fmt.Errorf("preflight: start %s: %w", base, err)
	}

	id := strings.TrimSpace(out)
	if id == "" {
		return "", fmt.Errorf("%w: docker run printed no ID for %s", ErrCgroupAccounting, base)
	}

	return id, nil
}

// checkCgroups holds the client-mode container's view of /sys/fs/cgroup to its own cgroup, found
// from the host's cgroup namespace by its ID, and reads its counters.
func (p *probe) checkCgroups(ctx context.Context) error {
	host, err := p.start(ctx, "preflight-host", "none", "host")
	if err != nil {
		return err
	}

	found, err := p.exec(ctx, host, "find", cgroupRoot, "-type", "d", "-name", "*"+p.client+"*")
	if err != nil {
		return fmt.Errorf("%w: find the probe's cgroup: %w", ErrCgroupAccounting, err)
	}

	dir, err := cgroupDir(found)
	if err != nil {
		return err
	}

	hostView, err := p.inode(ctx, host, dir)
	if err != nil {
		return err
	}

	clientView, err := p.inode(ctx, p.client, cgroupRoot)
	if err != nil {
		return err
	}

	if hostView != clientView {
		return fmt.Errorf(
			"%w: the client's %s (inode %d) is not its own cgroup %s (inode %d)",
			ErrCgroupAccounting, cgroupRoot, clientView, dir, hostView,
		)
	}

	cpuStat, err := p.exec(ctx, p.client, "cat", cgroupCPUStat)
	if err != nil {
		return fmt.Errorf("%w: read cpu.stat: %w", ErrCgroupAccounting, err)
	}

	_, err = cpuUsageMicros(cpuStat)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrCgroupAccounting, err)
	}

	peak, err := p.exec(ctx, p.client, "cat", cgroupMemoryPeak)
	if err != nil {
		return fmt.Errorf(
			"%w: read memory.peak (Linux 5.19 or later, with the memory controller): %w",
			ErrCgroupAccounting,
			err,
		)
	}

	_, err = memoryPeak(peak)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrCgroupAccounting, err)
	}

	return nil
}

// cgroupDir is the one cgroup directory find matched by the client's ID. None means the container
// has no cgroup of its own; more than one, or the root itself, identifies nothing.
func cgroupDir(found string) (string, error) {
	dirs := strings.Fields(found)
	if len(dirs) != 1 {
		return "", fmt.Errorf(
			"%w: the host's cgroup tree holds %d directories named after the container, not one: %q",
			ErrCgroupAccounting,
			len(dirs),
			dirs,
		)
	}

	if strings.TrimRight(dirs[0], "/") == cgroupRoot {
		return "", fmt.Errorf("%w: the container's cgroup is the root", ErrCgroupAccounting)
	}

	return dirs[0], nil
}

// inode reads a cgroup directory's inode in one container, the cgroup's identity in any mount of
// the hierarchy.
func (p *probe) inode(ctx context.Context, container, dir string) (uint64, error) {
	out, err := p.exec(ctx, container, "stat", "-c", "%i", dir)
	if err != nil {
		return 0, fmt.Errorf("%w: stat %s: %w", ErrCgroupAccounting, dir, err)
	}

	inode, err := strconv.ParseUint(strings.TrimSpace(out), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: inode of %s %q: %w", ErrCgroupAccounting, dir, out, err)
	}

	return inode, nil
}

// checkShaping runs the profile's shaper and loss commands, the same ones on the same device as the
// run's shaper, so a module the kernel cannot load fails here, once.
func (p *probe) checkShaping(ctx context.Context, profile *Profile) error {
	commands := ShaperCommands(profile)

	loss := LossCommand(profile)
	if loss != "" {
		commands = append(commands, loss)
	}

	for _, command := range commands {
		_, err := p.exec(ctx, p.client, strings.Fields(command)...)
		if err != nil {
			return fmt.Errorf(
				"%w: %s: %w (load them on the host: sudo modprobe -a %s)",
				ErrShaping, command, err, ShapingModules,
			)
		}
	}

	return nil
}

func (p *probe) exec(ctx context.Context, container string, command ...string) (string, error) {
	out, err := p.env.Docker(ctx, append([]string{"exec", container}, command...)...)
	if err != nil {
		return out, fmt.Errorf("exec in %s: %w", container, err)
	}

	return out, nil
}

// Builds builds the two images a run needs, in the order Prepare calls them.
type Builds interface {
	// Tools builds the tools image the probe and netguard run.
	Tools(ctx context.Context) (string, error)
	// Shipped builds BitGauge's image.
	Shipped(ctx context.Context) (string, error)
}

// PrepareOptions selects what Prepare checks.
type PrepareOptions struct {
	// Cgroups checks the cgroup accounting, for a runner that reports the client's counters.
	Cgroups bool
	// Shaped is the profile the shaping probe runs, nil when nothing is shaped.
	Shaped *Profile
}

// Prepared is what Prepare built.
type Prepared struct {
	ToolsImage    string
	BitGaugeImage string
}

// Prepare checks the daemon and builds the images, in the order testing.md section 5.1 gives: the
// daemon's cgroup claim before any build, the tools image, the probe, then BitGauge's image. A
// refusal returns before the next step, so no topology can start on a daemon it refused.
func Prepare(
	ctx context.Context,
	runner Docker,
	upProbe UpProbe,
	builds Builds,
	opts PrepareOptions,
) (Prepared, error) {
	if opts.Cgroups {
		err := CheckDaemonCgroups(ctx, runner)
		if err != nil {
			return Prepared{}, err
		}
	}

	tools, err := builds.Tools(ctx)
	if err != nil {
		return Prepared{}, fmt.Errorf("build the tools image: %w", err)
	}

	if opts.Cgroups || opts.Shaped != nil {
		err = Preflight(ctx, upProbe, PreflightOptions{
			ToolsImage: tools, Cgroups: opts.Cgroups, Shaped: opts.Shaped,
		})
		if err != nil {
			return Prepared{}, err
		}
	}

	image, err := builds.Shipped(ctx)
	if err != nil {
		return Prepared{}, fmt.Errorf("build BitGauge's image: %w", err)
	}

	return Prepared{ToolsImage: tools, BitGaugeImage: image}, nil
}

// FirstShaped is the first profile of the tier that this invocation shapes, nil when it shapes
// none (the ceiling tier, or HARNESS_SHAPE=none).
func FirstShaped(spec *TierSpec, unshaped bool) *Profile {
	if unshaped {
		return nil
	}

	for index := range spec.Profiles {
		if spec.Profiles[index].Shaped {
			return &spec.Profiles[index]
		}
	}

	return nil
}

// PreflightChecks reads HARNESS_PREFLIGHT: accounting, shaping, or empty for both.
func PreflightChecks(value string) (accounting, shaping bool, err error) {
	switch value {
	case "":
		return true, true, nil
	case PreflightAccounting:
		return true, false, nil
	case PreflightShaping:
		return false, true, nil
	default:
		return false, false, fmt.Errorf(
			"%w %q; use %s, %s or nothing for both",
			errUnknownPreflight, value, PreflightAccounting, PreflightShaping,
		)
	}
}
