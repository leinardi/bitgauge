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
	"maps"
	"slices"
	"strings"
	"sync"
	"testing"
)

const (
	probeTeardownCommand = "teardown"
	probeClient          = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
	probeHost            = "4040404040404040404040404040404040404040404040404040404040404040"
	probeDir             = "/sys/fs/cgroup/system.slice/docker-" + probeClient + ".scope"
	probeTools           = "tools:test"
)

var errFake = errors.New("fake docker failure")

// probeDocker answers the probe's docker commands as a healthy rootful daemon does, except where a
// test overrides one, and records every command, the fake builds' included.
type probeDocker struct {
	mu       sync.Mutex
	commands []string
	// answers overrides the answer to an exact command (joined by spaces).
	answers map[string]string
	// fails makes an exact command fail.
	fails map[string]bool
}

func newProbeDocker() *probeDocker {
	return &probeDocker{answers: map[string]string{}, fails: map[string]bool{}}
}

func (f *probeDocker) Run(_ context.Context, args ...string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	command := strings.Join(args, " ")
	f.commands = append(f.commands, command)

	if f.fails[command] {
		return "", errFake
	}

	answer, found := f.answers[command]
	if found {
		return answer, nil
	}

	return healthyAnswer(args, command), nil
}

func healthyAnswer(args []string, command string) string {
	clientExec := "exec " + probeClient + " "
	hostExec := "exec " + probeHost + " "

	switch {
	case command == "info --format "+daemonCgroupsFormat:
		return "systemd\t2\n"
	case args[0] == "run" && strings.Contains(command, "--cgroupns private"):
		return probeClient + "\n"
	case args[0] == "run" && strings.Contains(command, "--cgroupns host"):
		return probeHost + "\n"
	case strings.HasPrefix(command, hostExec+"find "):
		return probeDir + "\n"
	case command == hostExec+"stat -c %i "+probeDir, command == clientExec+"stat -c %i "+cgroupRoot:
		return "77915\n"
	case command == clientExec+"cat "+cgroupCPUStat:
		return "usage_usec 24356\nuser_usec 15335\nsystem_usec 9021\n"
	case command == clientExec+"cat "+cgroupMemoryPeak:
		return "8982528\n"
	}

	return ""
}

func (f *probeDocker) record(command string) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.commands = append(f.commands, command)
}

func (f *probeDocker) ran() []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.commands)
}

// fakeBuilds records each build in the fake daemon's command log, so the order is one list.
type fakeBuilds struct {
	docker *probeDocker
}

func (b *fakeBuilds) Tools(context.Context) (string, error) {
	b.docker.record("build tools")

	return probeTools, nil
}

func (b *fakeBuilds) Shipped(context.Context) (string, error) {
	b.docker.record("build shipped")

	return "bitgauge-harness:test", nil
}

// probeEnv is the probe's environment over the fake daemon: names in its own namespace, and its
// teardown recorded as one command, so a test sees when it ran.
type probeEnv struct {
	docker *probeDocker
}

func (e probeEnv) Docker(ctx context.Context, args ...string) (string, error) {
	return e.docker.Run(ctx, args...)
}

func (probeEnv) Name(base string) string { return "probe-" + base }

func upProbe(docker *probeDocker) UpProbe {
	return func(context.Context) (ProbeEnv, func(context.Context) error, error) {
		return probeEnv{docker: docker}, func(context.Context) error {
			docker.record(probeTeardownCommand)

			return nil
		}, nil
	}
}

func clientExec(command string) string { return "exec " + probeClient + " " + command }

func hostExec(command string) string { return "exec " + probeHost + " " + command }

// shapedProfile is a lossy profile on the 64 KiB minimum queue, so the probe runs the offload cap
// and the loss too.
func shapedProfile(t *testing.T) *Profile {
	t.Helper()

	for _, tier := range Tiers() {
		for index := range tier.Profiles {
			profile := &tier.Profiles[index]
			if profile.Shaped && profile.LossPercent > 0 && CapsOffload(profile) {
				return profile
			}
		}
	}

	t.Fatal("no shaped, lossy profile on the minimum queue")

	return nil
}

func runPreflight(t *testing.T, docker *probeDocker, cgroups bool, shaped *Profile) error {
	t.Helper()

	return Preflight(t.Context(), upProbe(docker), PreflightOptions{
		ToolsImage: probeTools, Cgroups: cgroups, Shaped: shaped,
	})
}

// teardownFrom is the index of the probe's teardown in commands, -1 without one.
func teardownFrom(commands []string) int {
	return slices.Index(commands, probeTeardownCommand)
}

// assertTornDown checks that the probe's environment was removed exactly once, after every command
// of the probe.
func assertTornDown(t *testing.T, commands []string) {
	t.Helper()

	from := teardownFrom(commands)
	if from < 0 || from != len(commands)-1 {
		t.Errorf("the probe was not torn down last, once: %q", commands)
	}
}

func TestJudgeDaemonCgroups(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		answer string
		ok     bool
	}{
		{"systemd\t2\n", true},
		{"cgroupfs\t2\n", true},
		{"none\t2\n", false},
		{"none\t\n", false},
		{"\t2\n", false},
		{"cgroupfs\t1\n", false},
		{"systemd\t1\n", false},
		{"cgroupfs\t\n", false},
		{"systemd 2\n", false},
		{"", false},
	} {
		err := judgeDaemonCgroups(test.answer)
		if test.ok && err != nil {
			t.Errorf("%q refused: %v", test.answer, err)
		}

		if !test.ok && !errors.Is(err, ErrCgroupAccounting) {
			t.Errorf("%q: err = %v, want ErrCgroupAccounting", test.answer, err)
		}
	}
}

// TestCheckDaemonCgroupsOnlyAsks pins that the daemon's claim is read before anything is built or
// started: docker info and nothing else, and a failed info refuses.
func TestCheckDaemonCgroupsOnlyAsks(t *testing.T) {
	t.Parallel()

	docker := newProbeDocker()
	docker.answers["info --format "+daemonCgroupsFormat] = "none\t\n"

	err := CheckDaemonCgroups(t.Context(), docker)
	if !errors.Is(err, ErrCgroupAccounting) || !strings.Contains(err.Error(), `driver "none"`) {
		t.Errorf("a cgroup-less daemon: err = %v", err)
	}

	if got := docker.ran(); !slices.Equal(got, []string{"info --format " + daemonCgroupsFormat}) {
		t.Errorf("ran %q, want only docker info", got)
	}

	docker = newProbeDocker()
	docker.fails["info --format "+daemonCgroupsFormat] = true

	err = CheckDaemonCgroups(t.Context(), docker)
	if !errors.Is(err, ErrCgroupAccounting) {
		t.Errorf("a failed docker info: err = %v", err)
	}
}

func TestCgroupDir(t *testing.T) {
	t.Parallel()

	for _, found := range []string{
		probeDir + "\n",
		"/sys/fs/cgroup/docker/" + probeClient + "\n",
		"/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/docker-" +
			probeClient + ".scope\n",
		"/sys/fs/cgroup/docker/" + probeHost + "/docker/" + probeClient + "\n",
	} {
		dir, err := cgroupDir(found)
		if err != nil || dir != strings.TrimSpace(found) {
			t.Errorf("cgroupDir(%q) = %q, %v", found, dir, err)
		}
	}

	for _, found := range []string{
		"",
		"\n",
		probeDir + "\n" + probeDir + "/init\n",
		"/sys/fs/cgroup\n",
		"/sys/fs/cgroup/\n",
	} {
		_, err := cgroupDir(found)
		if !errors.Is(err, ErrCgroupAccounting) {
			t.Errorf("cgroupDir(%q): err = %v, want ErrCgroupAccounting", found, err)
		}
	}
}

func TestPreflightPassesAHealthyDaemon(t *testing.T) {
	t.Parallel()

	docker := newProbeDocker()
	profile := shapedProfile(t)

	err := runPreflight(t, docker, true, profile)
	if err != nil {
		t.Fatal(err)
	}

	commands := docker.ran()
	assertTornDown(t, commands)

	for _, want := range append(ShaperCommands(profile), LossCommand(profile)) {
		if !slices.Contains(commands, clientExec(want)) {
			t.Errorf("the probe did not run %q in the client-mode container", want)
		}
	}

	client := slices.IndexFunc(commands, func(command string) bool {
		return strings.HasPrefix(command, "run ") && strings.Contains(command, "--cgroupns private")
	})
	if client < 0 ||
		!strings.Contains(
			commands[client],
			"--network probe-preflight-net",
		) {
		t.Errorf("the client-mode container is not on the probe's own network: %q", commands)
	}
}

// TestPreflightRefuses covers each way the probe refuses, and that it tears down after each.
func TestPreflightRefuses(t *testing.T) {
	t.Parallel()

	profile := shapedProfile(t)
	firstShaper := clientExec(ShaperCommands(profile)[0])

	for _, test := range []struct {
		name    string
		answers map[string]string
		fails   []string
		want    error
		says    string
	}{
		{
			name:    "no cgroup of its own",
			answers: map[string]string{hostExec("find /sys/fs/cgroup -type d -name *" + probeClient + "*"): ""},
			want:    ErrCgroupAccounting,
			says:    "0 directories",
		},
		{
			name:    "another cgroup",
			answers: map[string]string{clientExec("stat -c %i " + cgroupRoot): "1\n"},
			want:    ErrCgroupAccounting,
			says:    "is not its own cgroup",
		},
		{
			name:    "an unparsable inode",
			answers: map[string]string{clientExec("stat -c %i " + cgroupRoot): "?\n"},
			want:    ErrCgroupAccounting,
		},
		{
			name:  "a failed stat",
			fails: []string{hostExec("stat -c %i " + probeDir)},
			want:  ErrCgroupAccounting,
		},
		{
			name:  "no memory.peak",
			fails: []string{clientExec("cat " + cgroupMemoryPeak)},
			want:  ErrCgroupAccounting,
			says:  "memory.peak",
		},
		{
			name:    "an unreadable cpu.stat",
			answers: map[string]string{clientExec("cat " + cgroupCPUStat): "user_usec 1\n"},
			want:    ErrCgroupAccounting,
		},
		{
			name:  "a missing module",
			fails: []string{firstShaper},
			want:  ErrShaping,
			says:  ShaperCommands(profile)[0],
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			docker := newProbeDocker()
			maps.Copy(docker.answers, test.answers)

			for _, command := range test.fails {
				docker.fails[command] = true
			}

			err := runPreflight(t, docker, true, profile)
			if !errors.Is(err, test.want) || !strings.Contains(err.Error(), test.says) {
				t.Errorf("err = %v, want %v saying %q", err, test.want, test.says)
			}

			assertTornDown(t, docker.ran())
		})
	}
}

// TestPreflightNeverTrustsAStatistic pins that only the cgroup's identity counts: two views whose
// cgroup.procs read the same, with every other check passing, still refuse on an inode mismatch.
func TestPreflightNeverTrustsAStatistic(t *testing.T) {
	t.Parallel()

	docker := newProbeDocker()
	docker.answers[clientExec("stat -c %i "+cgroupRoot)] = "77916\n"
	docker.answers[clientExec("cat "+cgroupRoot+"/cgroup.procs")] = "1\n"
	docker.answers[hostExec("cat "+probeDir+"/cgroup.procs")] = "1\n"

	err := runPreflight(t, docker, true, nil)
	if !errors.Is(err, ErrCgroupAccounting) {
		t.Errorf("an inode mismatch with equal cgroup.procs: err = %v", err)
	}
}

func TestPreflightUnshapedRunsNoTc(t *testing.T) {
	t.Parallel()

	docker := newProbeDocker()

	err := runPreflight(t, docker, true, nil)
	if err != nil {
		t.Fatal(err)
	}

	for _, command := range docker.ran() {
		if strings.HasPrefix(command, "network create ") ||
			strings.HasPrefix(command, clientExec("tc ")) ||
			strings.HasPrefix(command, clientExec("ip ")) {
			t.Errorf("an unshaped probe ran %s", command)
		}

		if strings.HasPrefix(command, "run ") && !strings.Contains(command, "--network none") {
			t.Errorf("an unshaped probe container is on a network: %s", command)
		}
	}
}

func TestPreflightWithoutCgroupsReadsNoCounters(t *testing.T) {
	t.Parallel()

	docker := newProbeDocker()

	err := runPreflight(t, docker, false, shapedProfile(t))
	if err != nil {
		t.Fatal(err)
	}

	for _, command := range docker.ran() {
		if strings.Contains(command, cgroupRoot) || strings.Contains(command, "--cgroupns host") {
			t.Errorf("a shaping-only probe looked at cgroups: %s", command)
		}
	}
}

// TestPrepareOrder pins testing.md section 5.1's order: the daemon's claim before any build, the
// tools image, the probe and its teardown, then BitGauge's image; a refusal stops there.
func TestPrepareOrder(t *testing.T) {
	t.Parallel()

	prepare := func(docker *probeDocker, cgroups bool, shaped *Profile) (Prepared, error) {
		return Prepare(
			t.Context(),
			docker,
			upProbe(docker),
			&fakeBuilds{docker: docker},
			PrepareOptions{Cgroups: cgroups, Shaped: shaped},
		)
	}

	t.Run("a refused claim builds nothing", func(t *testing.T) {
		t.Parallel()

		docker := newProbeDocker()
		docker.answers["info --format "+daemonCgroupsFormat] = "none\t\n"

		_, err := prepare(docker, true, nil)
		if !errors.Is(err, ErrCgroupAccounting) {
			t.Errorf("err = %v", err)
		}

		if got := docker.ran(); !slices.Equal(
			got,
			[]string{"info --format " + daemonCgroupsFormat},
		) {
			t.Errorf("ran %q after a refused claim", got)
		}
	})

	t.Run("a refused probe never builds BitGauge", func(t *testing.T) {
		t.Parallel()

		docker := newProbeDocker()
		docker.answers[clientExec("stat -c %i "+cgroupRoot)] = "1\n"

		_, err := prepare(docker, true, nil)
		if !errors.Is(err, ErrCgroupAccounting) {
			t.Errorf("err = %v", err)
		}

		commands := docker.ran()
		if slices.Contains(commands, "build shipped") {
			t.Errorf("BitGauge's image was built after a refused probe: %q", commands)
		}

		if slices.Index(commands, "build tools") > slices.IndexFunc(commands, isProbeRun) {
			t.Errorf("the probe ran before the tools image was built: %q", commands)
		}

		assertTornDown(t, commands)
	})

	t.Run("a failed shaping probe never builds BitGauge", func(t *testing.T) {
		t.Parallel()

		docker := newProbeDocker()
		profile := shapedProfile(t)
		docker.fails[clientExec(ShaperCommands(profile)[0])] = true

		_, err := prepare(docker, false, profile)
		if !errors.Is(err, ErrShaping) || slices.Contains(docker.ran(), "build shipped") {
			t.Errorf("err = %v, ran %q", err, docker.ran())
		}
	})

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		docker := newProbeDocker()

		prepared, err := prepare(docker, true, shapedProfile(t))
		if err != nil {
			t.Fatal(err)
		}

		if prepared != (Prepared{ToolsImage: probeTools, BitGaugeImage: "bitgauge-harness:test"}) {
			t.Errorf("prepared = %+v", prepared)
		}

		commands := docker.ran()
		info := slices.Index(commands, "info --format "+daemonCgroupsFormat)
		tools := slices.Index(commands, "build tools")
		probe := slices.IndexFunc(commands, isProbeRun)
		teardown := teardownFrom(commands)
		shipped := slices.Index(commands, "build shipped")

		if info != 0 || tools <= info || probe <= tools || teardown <= probe ||
			shipped <= teardown ||
			shipped != len(commands)-1 {
			t.Errorf("order: info %d, tools %d, probe %d, teardown %d, shipped %d of %q",
				info, tools, probe, teardown, shipped, commands)
		}
	})

	t.Run("nothing to probe", func(t *testing.T) {
		t.Parallel()

		docker := newProbeDocker()

		_, err := prepare(docker, false, nil)
		if err != nil {
			t.Fatal(err)
		}

		if got := docker.ran(); !slices.Equal(got, []string{"build tools", "build shipped"}) {
			t.Errorf("ran %q", got)
		}
	})
}

func isProbeRun(command string) bool {
	return strings.HasPrefix(command, "run ")
}

func TestFirstShaped(t *testing.T) {
	t.Parallel()

	for _, tier := range Tiers() {
		got := FirstShaped(&tier, false)

		want := slices.IndexFunc(
			tier.Profiles,
			func(profile Profile) bool { return profile.Shaped },
		)
		if want < 0 {
			if got != nil {
				t.Errorf("%s shapes nothing, FirstShaped = %s", tier.Tier, got.Name)
			}

			continue
		}

		if got != &tier.Profiles[want] {
			t.Errorf("%s: FirstShaped is not its first shaped profile", tier.Tier)
		}

		if FirstShaped(&tier, true) != nil {
			t.Errorf("%s with HARNESS_SHAPE=none still shapes", tier.Tier)
		}
	}
}

func TestPreflightChecks(t *testing.T) {
	t.Parallel()

	for value, want := range map[string][2]bool{
		"":                  {true, true},
		PreflightAccounting: {true, false},
		PreflightShaping:    {false, true},
	} {
		accounting, shaping, err := PreflightChecks(value)
		if err != nil || [2]bool{accounting, shaping} != want {
			t.Errorf("PreflightChecks(%q) = %v, %v, %v", value, accounting, shaping, err)
		}
	}

	_, _, err := PreflightChecks("both")
	if err == nil {
		t.Error("an unknown preflight was accepted")
	}
}
