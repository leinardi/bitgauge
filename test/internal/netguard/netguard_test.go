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

package netguard

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/testenv"
)

const listenPort = 8080

var toolsImage string

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

	toolsImage, err = BuildToolsImage(ctx, runner, filepath.Join("..", "..", ".."))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)

		return 1
	}

	return m.Run()
}

// TestControlsIncrementTheirCounters prepares a guard -- which already fails if a control is not
// seen -- and then repeats each control on its own, so the test also says which counter each one
// moves and that the reset leaves all three at zero.
func TestControlsIncrementTheirCounters(t *testing.T) {
	t.Parallel()

	guard := startGuard(t, Options{})

	counters, err := guard.Counters(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !counters.Zero() {
		t.Fatalf("the counters are %v after the reset, want all zero", counters)
	}

	for _, check := range controls(listenPort) {
		err = guard.Reset(t.Context())
		if err != nil {
			t.Fatal(err)
		}

		_, _ = guard.Exec(t.Context(), check.command...)

		counters, err = guard.Counters(t.Context())
		if err != nil {
			t.Fatal(err)
		}

		if counters[check.counter] == 0 {
			t.Errorf("%s left %s at zero: %v", check.name, check.counter, counters)
		}
	}
}

// TestListenPortIsNotCounted pins the one loopback exception: the healthcheck's connection to the
// listen port.
func TestListenPortIsNotCounted(t *testing.T) {
	t.Parallel()

	guard := startGuard(t, Options{})

	_, _ = guard.Exec(
		t.Context(),
		"iperf3",
		"--client",
		"127.0.0.1",
		"--port",
		"8080",
		"--connect-timeout",
		"500",
		"--time",
		"1",
	)

	counters, err := guard.Counters(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !counters.Zero() {
		t.Errorf("a connection to the listen port was counted: %v", counters)
	}
}

// TestWithoutTheSinkRoutesTheGuardIsBlind is the negative test of the guard itself: without the
// sink's default routes a connect to a non-local address fails with "network unreachable" before
// any packet is built, and the controls have to say so.
func TestWithoutTheSinkRoutesTheGuardIsBlind(t *testing.T) {
	t.Parallel()

	env, network := environment(t)

	_, err := Start(t.Context(), env, Options{
		ToolsImage: toolsImage, Network: network, ListenPort: listenPort, withoutSinkRoutes: true,
	})
	if !errors.Is(err, ErrInstrumentBlind) {
		t.Fatalf("a guard without sink routes was prepared, err = %v", err)
	}
}

func startGuard(t *testing.T, opts Options) *Guard {
	t.Helper()

	env, network := environment(t)

	opts.ToolsImage = toolsImage
	opts.Network = network
	opts.ListenPort = listenPort

	guard, err := Start(t.Context(), env, opts)
	if err != nil {
		t.Fatal(err)
	}

	return guard
}

func environment(t *testing.T) (env *testenv.Env, network string) {
	t.Helper()

	provider, err := testenv.New()
	if err != nil {
		t.Fatal(err)
	}

	env, err = provider.Up(t.Context(), testenv.SpecFromEnv())
	if err != nil {
		t.Fatal(err)
	}

	env.Cleanup(t, provider)

	network = env.Name("net")

	_, err = env.Docker(t.Context(), "network", "create", "--internal", network)
	if err != nil {
		t.Fatal(err)
	}

	return env, network
}
