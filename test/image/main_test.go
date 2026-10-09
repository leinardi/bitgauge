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

// Package image_test builds the shipped image and asserts what it does once started (testing.md
// section 5, build-packaging.md section 1): read-only and unprivileged, healthy, serving the API
// and the SPA, sending no packet out, writing nothing, and -- under strace from process start --
// attempting no connection and no file write.
package image_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/netguard"
	"github.com/leinardi/bitgauge/test/internal/syscalltrace"
	"github.com/leinardi/bitgauge/test/internal/testenv"
)

const (
	listenPort  = 8080
	pollEvery   = 200 * time.Millisecond
	pollTimeout = 60 * time.Second
)

var (
	repoRoot   = filepath.Join("..", "..")
	toolsImage string
)

// TestMain sweeps abandoned environments of earlier runs, then builds the tools image once.
func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	ctx := context.Background()
	runner := testenv.DockerCLI{Logger: testenv.NewLogger(os.Stderr)}

	rules, err := testenv.DefaultRules("")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)

		return 1
	}

	_, err = testenv.Sweep(ctx, runner, rules)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stale sweep:", err)

		return 1
	}

	toolsImage, err = netguard.BuildToolsImage(ctx, runner, repoRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)

		return 1
	}

	return m.Run()
}

// environment brings up a test environment that goes when the test ends, kept on failure when
// BITGAUGE_TEST_KEEP_ON_FAILURE=1.
func environment(t *testing.T) *testenv.Env {
	t.Helper()

	provider, err := testenv.New()
	if err != nil {
		t.Fatal(err)
	}

	env, err := provider.Up(t.Context(), testenv.SpecFromEnv())
	if err != nil {
		t.Fatal(err)
	}

	env.Cleanup(t, provider)

	return env
}

// docker runs one docker command in the environment and fails the test if it does not succeed.
func docker(t *testing.T, env *testenv.Env, args ...string) string {
	t.Helper()

	out, err := env.Docker(t.Context(), args...)
	if err != nil {
		t.Fatal(err)
	}

	return strings.TrimSpace(out)
}

// eventually retries check until it succeeds or the poll timeout passes.
func eventually(t *testing.T, what string, check func() error) {
	t.Helper()

	deadline := time.Now().Add(pollTimeout)

	for {
		err := check()
		if err == nil {
			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("%s: still failing after %s: %v", what, pollTimeout, err)
		}

		select {
		case <-t.Context().Done():
			t.Fatalf("%s: %v", what, t.Context().Err())
		case <-time.After(pollEvery):
		}
	}
}

// traceDir returns a directory the tracer container can write as this user.
func traceDir(t *testing.T) string {
	t.Helper()

	return t.TempDir()
}

// hostUser is the --user value that lets a container write into traceDir.
func hostUser() string {
	return strconv.Itoa(os.Getuid()) + ":" + strconv.Itoa(os.Getgid())
}

// strace returns the docker run arguments that trace command from process start in the tools
// image, writing the trace to /trace/<name>.strace.
func strace(network, dir, name string, command ...string) []string {
	args := make([]string, 0, 32+len(command))
	args = append(args,
		"--network", network,
		"--cap-drop", "ALL", "--cap-add", "SYS_PTRACE",
		"--user", hostUser(),
		"--volume", dir+":/trace",
		toolsImage,
		"strace", "-f", "-yy", "-e", syscalltrace.TraceSet, "-o", "/trace/"+name+".strace",
	)

	return append(args, command...)
}

// readTrace parses a trace the tracer wrote.
func readTrace(t *testing.T, dir, name string) []syscalltrace.Event {
	t.Helper()

	file, err := os.Open(filepath.Join(dir, name+".strace"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	events, err := syscalltrace.Parse(file)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}

	return events
}
