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

package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/internal/config"
)

// failsafe bounds every wait in these tests against a hang; none of them waits for state.
const failsafe = 60 * time.Second

func TestParseArgs(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		args []string
		want options
		fail bool
	}{
		{nil, options{command: commandServe, configPath: config.DefaultPath}, false},
		{[]string{"serve"}, options{command: commandServe, configPath: config.DefaultPath}, false},
		{[]string{"healthcheck"}, options{command: commandHealthcheck, configPath: config.DefaultPath}, false},
		{[]string{"--config", "/x.yaml"}, options{command: commandServe, configPath: "/x.yaml", explicit: true}, false},
		{[]string{"-config=/x.yaml"}, options{command: commandServe, configPath: "/x.yaml", explicit: true}, false},
		{[]string{"serve", "--config", "/x.yaml"}, options{command: commandServe, configPath: "/x.yaml", explicit: true}, false},
		{[]string{"healthcheck", "--config", "/x.yaml"}, options{command: commandHealthcheck, configPath: "/x.yaml", explicit: true}, false},
		// An explicit default path is still explicit: then it must exist.
		{[]string{"--config", config.DefaultPath}, options{command: commandServe, configPath: config.DefaultPath, explicit: true}, false},
		{[]string{"--help"}, options{help: true}, false},
		{[]string{"healthcheck", "-h"}, options{help: true}, false},
		{[]string{"version"}, options{}, true},
		{[]string{"serve", "extra"}, options{}, true},
		{[]string{"--config"}, options{}, true},
		{[]string{"--verbose"}, options{}, true},
		{[]string{"--config", "/x.yaml", "healthcheck"}, options{}, true},
	} {
		got, err := parseArgs(test.args, io.Discard)
		if (err != nil) != test.fail || got != test.want {
			t.Fatalf("%q: %+v, %v; want %+v, failure %v", test.args, got, err, test.want, test.fail)
		}
	}
}

func listenConfig(t *testing.T, listen, basePath string) *config.Config {
	t.Helper()

	cfg := config.Defaults()
	cfg.Server.BasePath = basePath

	err := cfg.Server.Listen.UnmarshalText([]byte(listen))
	if err != nil {
		t.Fatal(err)
	}

	return &cfg
}

func TestHealthcheckAddress(t *testing.T) {
	t.Parallel()

	// Every server.listen shape of backend.md section 6.
	for _, test := range []struct{ listen, basePath, want string }{
		{":8080", "/", "http://127.0.0.1:8080/api/v1/ping"},
		{"0.0.0.0:8080", "/", "http://127.0.0.1:8080/api/v1/ping"},
		{"[::]:8080", "/", "http://[::1]:8080/api/v1/ping"},
		{"[::ffff:0.0.0.0]:8080", "/", "http://127.0.0.1:8080/api/v1/ping"},
		{"192.168.1.10:8080", "/", "http://192.168.1.10:8080/api/v1/ping"},
		{"[fd00::5]:8080", "/", "http://[fd00::5]:8080/api/v1/ping"},
		{"127.0.0.1:9000", "/speed", "http://127.0.0.1:9000/speed/api/v1/ping"},
		{":8080", "/speed/", "http://127.0.0.1:8080/speed/api/v1/ping"},
	} {
		if got := healthcheckURL(listenConfig(t, test.listen, test.basePath)); got != test.want {
			t.Fatalf("%s under %s: %s, want %s", test.listen, test.basePath, got, test.want)
		}
	}
}

// pingServer answers GET /api/v1/ping with status, and counts the requests.
func pingServer(t *testing.T, status int) (cfg *config.Config, requests *int) {
	t.Helper()

	var (
		mu    sync.Mutex
		count int
	)

	server := httptest.NewServer(
		http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			mu.Lock()
			count++
			mu.Unlock()

			if request.URL.Path != "/api/v1/ping" || request.Method != http.MethodGet {
				writer.WriteHeader(http.StatusTeapot)

				return
			}

			if status == http.StatusFound {
				http.Redirect(writer, request, "/elsewhere", status)

				return
			}

			writer.WriteHeader(status)
		}),
	)
	t.Cleanup(server.Close)

	return listenConfig(t, server.Listener.Addr().String(), "/"), &count
}

func TestHealthcheckExitCodes(t *testing.T) {
	t.Parallel()

	for status, want := range map[int]int{
		http.StatusNoContent:           0,
		http.StatusOK:                  exitFailure,
		http.StatusFound:               exitFailure,
		http.StatusInternalServerError: exitFailure,
	} {
		cfg, requests := pingServer(t, status)
		if got := healthcheck(t.Context(), cfg); got != want {
			t.Fatalf("answer %d: exit %d, want %d", status, got, want)
		}

		// One request, and a redirect is not followed.
		if *requests != 1 {
			t.Fatalf("answer %d: %d requests, want 1", status, *requests)
		}
	}

	// Nothing listening.
	listener, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	address := listener.Addr().String()
	_ = listener.Close()

	if got := healthcheck(t.Context(), listenConfig(t, address, "/")); got != exitFailure {
		t.Fatalf("nothing listening: exit %d, want 1", got)
	}
}

var (
	builtBinary string
	errBuild    error
)

// TestMain builds the command once into a temporary directory, as the release build would,
// for the tests that run it as a subprocess, and removes it afterwards.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "bitgauge-test-")
	if err != nil {
		errBuild = err
	} else {
		builtBinary = filepath.Join(dir, "bitgauge")

		output, buildErr := exec.CommandContext(context.Background(), "go", "build", "-o",
			builtBinary, ".").CombinedOutput()
		if buildErr != nil {
			errBuild = fmt.Errorf("%w: %s", buildErr, output)
		}
	}

	code := m.Run()

	if dir != "" {
		_ = os.RemoveAll(dir)
	}

	os.Exit(code)
}

// binary is the command TestMain built.
func binary(t *testing.T) string {
	t.Helper()

	if errBuild != nil {
		t.Fatalf("build: %v", errBuild)
	}

	return builtBinary
}

func emptyConfig(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "config.yaml")

	err := os.WriteFile(path, nil, 0o600)
	if err != nil {
		t.Fatal(err)
	}

	return path
}

func TestServeExitsTwoOnInvalidConfig(t *testing.T) {
	t.Parallel()

	bin := binary(t)
	empty := emptyConfig(t)
	invalidFile := filepath.Join(t.TempDir(), "invalid.yaml")

	err := os.WriteFile(invalidFile, []byte("limits:\n  max_streams_per_client: 0\n"), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name string
		args []string
		env  []string
		want int
	}{
		{"missing explicit file", []string{"--config", filepath.Join(t.TempDir(), "absent.yaml")}, nil, 2},
		{"invalid file value", []string{"--config", invalidFile}, nil, 2},
		{"invalid environment value", []string{"serve", "--config", empty}, []string{"BITGAUGE_LOG__LEVEL=loud"}, 2},
		{"metrics.path collision", []string{"--config", empty}, []string{"BITGAUGE_METRICS__PATH=/upload"}, 2},
		{"unknown command", []string{"version"}, nil, 2},
		{"healthcheck with an invalid file", []string{"healthcheck", "--config", invalidFile}, nil, 1},
	} {
		ctx, cancel := context.WithTimeout(t.Context(), failsafe)
		command := exec.CommandContext(ctx, bin, test.args...)
		command.Env = test.env
		command.Stdout, command.Stderr = io.Discard, io.Discard

		err := command.Run()

		cancel()

		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) || exitErr.ExitCode() != test.want {
			t.Fatalf("%s: %v, want exit status %d", test.name, err, test.want)
		}
	}
}

func TestServeAndHealthcheck(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	// server.listen takes ports from 1, so a free one is found first.
	probe, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	free := probe.Addr().String()
	_ = probe.Close()

	output, logs := io.Pipe()
	environ := []string{"BITGAUGE_SERVER__LISTEN=" + free, "BITGAUGE_LOG__FORMAT=text"}
	done := make(chan int, 1)

	go func() {
		done <- run(ctx, []string{"--config", emptyConfig(t)}, environ, logs, io.Discard)

		_ = logs.Close()
	}()

	// The startup line names the address the listener got.
	address := ""
	lines := bufio.NewScanner(output)

	for address == "" && lines.Scan() {
		if _, rest, found := strings.Cut(lines.Text(), "msg=starting "); found {
			for field := range strings.FieldsSeq(rest) {
				if value, isListen := strings.CutPrefix(field, "listen="); isListen {
					address = value
				}
			}
		}
	}

	go func() { _, _ = io.Copy(io.Discard, output) }()

	if address == "" {
		t.Fatal("no startup line with the listen address")
	}

	if address != free {
		t.Fatalf("listening on %s, want %s", address, free)
	}

	host, port, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatal(err)
	}

	cfg := config.Defaults()
	cfg.Server.Listen.Host = host
	cfg.Server.Listen.Port, _ = strconv.Atoi(port)

	if got := healthcheck(t.Context(), &cfg); got != 0 {
		t.Fatalf("healthcheck of the running server: exit %d, want 0", got)
	}

	cancel()

	select {
	case got := <-done:
		if got != 0 {
			t.Fatalf("serve exited %d after a clean shutdown, want 0", got)
		}
	case <-time.After(failsafe):
		t.Fatal("serve did not stop")
	}
}
