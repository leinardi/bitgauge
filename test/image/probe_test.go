//go:build image

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

package image_test

import (
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/syscalltrace"
)

const probeListen = "127.0.0.1:18080"

// TestProbe is the negative control of the syscall layer: the probe is traced exactly the way
// bitgauge serve is, in each of its modes, and the serve policy must pass the clean one and reject
// each forbidden act for its own reason. A forbidden act that passes fails the test as "analyser
// blind" -- the layer would then pass the real binary without having looked.
func TestProbe(t *testing.T) {
	t.Parallel()

	binDir := t.TempDir()
	buildProbe(t, binDir)

	for _, test := range []struct {
		mode   string
		reason string
	}{
		{"serve", ""},
		{"connect-back", "serve may not connect"},
		{"sendto-peer", "a send with an explicit destination address"},
		{"file-create", "with write intent on /tmp/probe-was-here"},
	} {
		t.Run(test.mode, func(t *testing.T) {
			t.Parallel()

			env := environment(t)
			dir := traceDir(t)
			tracer := env.Name("probe")

			args := append(
				[]string{"run", "--detach", "--name", tracer, "--volume", binDir + ":/probe:ro"},
				strace(
					"none",
					dir,
					test.mode,
					"/probe/probe",
					"-mode",
					test.mode,
					"-listen",
					probeListen,
					"-dir",
					"/tmp",
				)...)
			docker(t, env, args...)

			// The probe serves one request and exits; until it listens, wget is refused.
			eventually(t, "the probe's request", func() error {
				_, err := env.Docker(
					t.Context(),
					"exec",
					tracer,
					"wget",
					"-q",
					"-O",
					"/dev/null",
					"http://"+probeListen+"/",
				)
				if err != nil {
					return fmt.Errorf("request the probe: %w", err)
				}

				return nil
			})

			if code := docker(t, env, "wait", tracer); code != "0" {
				t.Fatalf("the probe exited %s:\n%s", code, docker(t, env, "logs", tracer))
			}

			violations, stats := syscalltrace.CheckServe(
				readTrace(t, dir, test.mode),
				netip.MustParseAddrPort(probeListen),
			)
			if stats.AcceptedSends == 0 {
				t.Fatalf(
					"analyser blind: the trace shows no send on the accepted connection (%+v)",
					stats,
				)
			}

			if test.reason == "" {
				if len(violations) != 0 {
					t.Errorf("the clean probe was rejected: %v", violations)
				}

				return
			}

			for _, violation := range violations {
				if strings.Contains(violation.Reason, test.reason) {
					return
				}
			}

			t.Errorf(
				"analyser blind: %s was not rejected for %q: %v",
				test.mode,
				test.reason,
				violations,
			)
		})
	}
}

// buildProbe compiles test/image/testdata/probe as a static linux binary into dir.
func buildProbe(t *testing.T, dir string) {
	t.Helper()

	//nolint:gosec // G204: the only variable argument is the test's own temporary directory.
	cmd := exec.CommandContext(
		t.Context(),
		"go",
		"build",
		"-trimpath",
		"-o",
		filepath.Join(dir, "probe"),
		"./testdata/probe",
	)

	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux")

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build the probe: %v\n%s", err, out)
	}
}
