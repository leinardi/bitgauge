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
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/netguard"
	"github.com/leinardi/bitgauge/test/internal/syscalltrace"
	"github.com/leinardi/bitgauge/test/internal/testenv"
)

const (
	runtimeUID = "65532"
	// listenAll is the default server.listen, :8080, as the serve policy reads it.
	listenAll = "0.0.0.0:8080"
	// healthcheckTarget is where the healthcheck connects for :8080 (backend.md section 6).
	healthcheckTarget = "127.0.0.1:8080"
)

var (
	errNoBinary     = errors.New("the image holds no /bitgauge")
	errNotHealthy   = errors.New("not healthy")
	errBadArchive   = errors.New("unexpected docker image save archive")
	errBinaryTooBig = errors.New("the binary is larger than any BitGauge build")
	maxBinaryBytes  = int64(256 << 20)
)

// TestImage runs the plan's sequence over one built image. The steps share the image and the
// guard, and each depends on the one before, so they are one test rather than independent ones.
func TestImage(t *testing.T) {
	_, err := os.Stat(filepath.Join(repoRoot, "cmd", "bitgauge", "main.go"))
	if err != nil {
		t.Fatalf(
			"the image test is dormant: cmd/bitgauge/main.go does not exist yet, so there is no "+
				"image to build (%v)",
			err,
		)
	}

	env := environment(t)
	image := buildImage(t, env)

	network := env.Name("net")
	docker(t, env, "network", "create", "--internal", network)

	// 1. The guard is prepared -- rules, sink, negative controls, reset -- before BitGauge starts.
	guard, err := netguard.Start(t.Context(), env, netguard.Options{
		ToolsImage: toolsImage, Network: network, ListenPort: listenPort,
	})
	if err != nil {
		t.Fatal(err)
	}

	server := env.Name("bitgauge")
	docker(t, env, "run", "--detach", "--name", server,
		"--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--network", guard.NetworkMode(),
		"--health-interval", "1s",
		image)

	// 2. Unprivileged, and healthy both by the image's HEALTHCHECK and by the subcommand, run
	// once the server is known to be up so a slow start is not a failure.
	assertUnprivileged(t, env, server)
	waitHealthy(t, env, server)
	docker(t, env, "exec", server, "/bitgauge", "healthcheck")

	// 3. The API and the SPA answer, fetched from inside the guard's namespace.
	assertServes(t, func(path string) (string, error) {
		return guard.Exec(t.Context(), "wget", "-q", "-O", "-", "http://127.0.0.1:8080"+path)
	})

	docker(t, env, "rm", "--force", server)

	// 6. The syscall layer, on the same guard: serve traced from process start, the healthcheck
	// in its own session.
	traceSyscalls(t, env, image, guard)

	// 4. No packet left the namespace, from the server's start to here.
	counters, err := guard.Counters(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !counters.Zero() {
		t.Errorf("packets tried to leave BitGauge's namespace: %v", counters)
	}

	// 5. Writable, it still writes nothing.
	assertWritesNothing(t, env, image, network)
}

func buildImage(t *testing.T, env *testenv.Env) string {
	t.Helper()

	image := "bitgauge-test-image:" + env.ID

	docker(t, env, "buildx", "build", "--load", "--tag", image,
		"--file", filepath.Join(repoRoot, "deployments", "docker", "Dockerfile"), repoRoot)

	// The image carries no environment label, so neither Down nor the sweep would remove it. The
	// test's context is already canceled when cleanups run, hence a fresh one.
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		_, err := env.Docker(ctx, "image", "rm", "--force", image)
		if err != nil {
			t.Errorf("remove the test image %s: %v", image, err)
		}
	})

	return image
}

func assertUnprivileged(t *testing.T, env *testenv.Env, container string) {
	t.Helper()

	if user := docker(
		t,
		env,
		"inspect",
		"--format",
		"{{.Config.User}}",
		container,
	); user != runtimeUID+":"+runtimeUID {
		t.Errorf("the container runs as %q, want %s:%s", user, runtimeUID, runtimeUID)
	}

	// docker top refuses a format without the PID column, so it is asked for and skipped.
	processes := docker(t, env, "top", container, "-eo", "pid,uid,gid")

	lines := strings.Split(processes, "\n")
	if len(lines) < 2 {
		t.Fatalf("docker top shows no process:\n%s", processes)
	}

	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) != 3 {
			t.Fatalf("unexpected docker top line %q", line)
		}

		for _, id := range fields[1:] {
			if id != runtimeUID {
				t.Errorf("a process runs with uid/gid %q, want %s: %s", id, runtimeUID, line)
			}
		}
	}
}

func waitHealthy(t *testing.T, env *testenv.Env, container string) {
	t.Helper()

	eventually(t, "the health status", func() error {
		status, err := env.Docker(
			t.Context(),
			"inspect",
			"--format",
			"{{.State.Health.Status}}",
			container,
		)
		if err != nil {
			return fmt.Errorf("inspect %s: %w", container, err)
		}

		if strings.TrimSpace(status) != "healthy" {
			return fmt.Errorf("%w: %s", errNotHealthy, strings.TrimSpace(status))
		}

		return nil
	})
}

// assertServes fetches /api/v1/info and /. wget exits non-zero on any status of 400 and above,
// so a body coming back is a success status.
func assertServes(t *testing.T, get func(path string) (string, error)) {
	t.Helper()

	var info map[string]any

	eventually(t, "GET /api/v1/info", func() error {
		body, err := get("/api/v1/info")
		if err != nil {
			return err
		}

		err = json.Unmarshal([]byte(body), &info)
		if err != nil {
			return fmt.Errorf("decode the info response: %w", err)
		}

		return nil
	})

	if len(info) == 0 {
		t.Errorf("GET /api/v1/info returned an empty object")
	}

	page, err := get("/")
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}

	if !strings.Contains(strings.ToLower(page), "<html") {
		t.Errorf("GET / did not serve the SPA:\n%s", page)
	}
}

// assertWritesNothing runs the image without --read-only and checks that its filesystem did not
// change: it does not even try to write.
func assertWritesNothing(t *testing.T, env *testenv.Env, image, network string) {
	t.Helper()

	server := env.Name("writable")
	docker(t, env, "run", "--detach", "--name", server,
		"--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--network", network, "--health-interval", "1s",
		image)

	waitHealthy(t, env, server)
	assertServes(t, func(path string) (string, error) {
		return env.Docker(t.Context(), "run", "--rm", "--network", network, toolsImage,
			"wget", "-q", "-O", "-", "http://"+server+":8080"+path)
	})

	if diff := docker(t, env, "diff", server); diff != "" {
		t.Errorf("the container changed its filesystem:\n%s", diff)
	}
}

// traceSyscalls copies the binary out of the image, checks it is the image's own, and runs it
// under strace in the tools image on the guard's namespace.
func traceSyscalls(t *testing.T, env *testenv.Env, image string, guard *netguard.Guard) {
	t.Helper()

	dir := traceDir(t)
	binary := filepath.Join(dir, "bitgauge")

	copier := env.Name("copy")
	docker(t, env, "create", "--name", copier, image)
	docker(t, env, "cp", copier+":/bitgauge", binary)

	copied := fileSHA256(t, binary)

	inImage, err := imageBinarySHA256(t, env, image)
	if err != nil {
		t.Fatal(err)
	}

	if copied != inImage {
		t.Fatalf("the copied binary (%s) is not the image's (%s)", copied, inImage)
	}

	tracer := env.Name("trace-serve")
	docker(t, env, append([]string{"run", "--detach", "--name", tracer},
		strace(guard.NetworkMode(), dir, "serve", "/trace/bitgauge", "serve")...)...)

	assertServes(t, func(path string) (string, error) {
		return guard.Exec(t.Context(), "wget", "-q", "-O", "-", "http://127.0.0.1:8080"+path)
	})

	docker(t, env, append([]string{"run", "--rm"},
		strace(guard.NetworkMode(), dir, "healthcheck", "/trace/bitgauge", "healthcheck")...)...)

	docker(t, env, "stop", "--time", "10", tracer)

	violations, stats := syscalltrace.CheckServe(
		readTrace(t, dir, "serve"),
		netip.MustParseAddrPort(listenAll),
	)
	if stats.AcceptedSends == 0 {
		t.Errorf(
			"analyser blind: the serve trace shows no send on an accepted connection (%+v)",
			stats,
		)
	}

	for _, violation := range violations {
		t.Errorf("serve: %s", violation)
	}

	violations, stats = syscalltrace.CheckHealthcheck(readTrace(t, dir, "healthcheck"),
		netip.MustParseAddrPort(healthcheckTarget))
	if stats.AcceptedSends == 0 {
		t.Errorf("analyser blind: the healthcheck trace shows no request sent (%+v)", stats)
	}

	for _, violation := range violations {
		t.Errorf("healthcheck: %s", violation)
	}
}

func fileSHA256(t *testing.T, path string) string {
	t.Helper()

	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	hash := sha256.New()

	_, err = io.Copy(hash, file)
	if err != nil {
		t.Fatal(err)
	}

	return hex.EncodeToString(hash.Sum(nil))
}

// imageBinarySHA256 hashes /bitgauge as the image's own layers hold it, read from docker image
// save rather than through a container, so the comparison is between two independent copies.
func imageBinarySHA256(t *testing.T, env *testenv.Env, image string) (string, error) {
	t.Helper()

	archive := filepath.Join(t.TempDir(), "image.tar")
	docker(t, env, "image", "save", "--output", archive, image)

	entries, err := readTar(archive)
	if err != nil {
		return "", err
	}

	// Decoded as maps: the keys are docker's, in docker's spelling.
	var manifest []map[string]json.RawMessage

	err = json.Unmarshal(entries["manifest.json"], &manifest)
	if err != nil {
		return "", fmt.Errorf("read manifest.json: %w", err)
	}

	if len(manifest) != 1 {
		return "", fmt.Errorf("%w: manifest.json lists %d images", errBadArchive, len(manifest))
	}

	var layers []string

	err = json.Unmarshal(manifest[0]["Layers"], &layers)
	if err != nil {
		return "", fmt.Errorf("read the layers of manifest.json: %w", err)
	}

	// The last layer that holds the file is the one the image shows.
	for _, name := range slices.Backward(layers) {
		layer, ok := entries[name]
		if !ok {
			return "", fmt.Errorf("%w: manifest.json names a missing layer %s", errBadArchive, name)
		}

		sum, found, err := hashInLayer(layer, "bitgauge")
		if err != nil {
			return "", err
		}

		if found {
			return sum, nil
		}
	}

	return "", errNoBinary
}

func readTar(path string) (map[string][]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	entries := map[string][]byte{}
	reader := tar.NewReader(bufio.NewReader(file))

	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return entries, nil
		}

		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		content, err := io.ReadAll(reader)
		if err != nil {
			return nil, fmt.Errorf("read %s in %s: %w", header.Name, path, err)
		}

		entries[header.Name] = content
	}
}

// hashInLayer looks for name in one layer, which docker image save writes plain or gzipped.
func hashInLayer(layer []byte, name string) (sum string, found bool, err error) {
	var source io.Reader = bytes.NewReader(layer)

	if bytes.HasPrefix(layer, []byte{0x1f, 0x8b}) {
		unzipped, err := gzip.NewReader(source)
		if err != nil {
			return "", false, fmt.Errorf("gunzip a layer: %w", err)
		}

		source = unzipped
	}

	reader := tar.NewReader(source)

	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return "", false, nil
		}

		if err != nil {
			return "", false, fmt.Errorf("read a layer: %w", err)
		}

		if strings.TrimPrefix(header.Name, "./") != name {
			continue
		}

		hash := sha256.New()

		// Bounded: a layer is untrusted input to this reader, and no build of BitGauge comes close.
		copied, err := io.CopyN(hash, reader, maxBinaryBytes+1)
		if err != nil && !errors.Is(err, io.EOF) {
			return "", false, fmt.Errorf("hash %s: %w", name, err)
		}

		if copied > maxBinaryBytes {
			return "", false, errBinaryTooBig
		}

		return hex.EncodeToString(hash.Sum(nil)), true, nil
	}
}
