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

package dockerfiles_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/dockerfiles"
)

const (
	shippedDir        = "deployments/docker"
	shippedDockerfile = "deployments/docker/Dockerfile"
	releaseWorkflow   = ".github/workflows/release.yaml"
	workflowsDir      = ".github/workflows"
	buildPackagingDoc = "docs/features/technical-stack/build-packaging.md"
	wantPlatforms     = "linux/amd64,linux/arm64"
	runtimeUser       = "65532:65532"
	// healthcheck is the runtime stage's HEALTHCHECK, timings included, exactly as
	// build-packaging.md section 1 documents it.
	healthcheckTimings = "--interval=30s --timeout=5s --start-period=5s --retries=3"
	healthcheck        = healthcheckTimings + ` CMD ["/bitgauge", "healthcheck"]`
)

// TestShippedDockerfileIsTheOnlyOne pins that deployments/docker holds exactly the image that
// ships. A second file there would look shipped to every reader and be built by nothing.
func TestShippedDockerfileIsTheOnlyOne(t *testing.T) {
	t.Parallel()

	entries, err := os.ReadDir(repoPath(t, shippedDir))
	if err != nil {
		t.Fatalf("read %s: %v", shippedDir, err)
	}

	var found []string

	for _, entry := range entries {
		if isDockerfile(entry.Name()) {
			found = append(found, entry.Name())
		}
	}

	if !slices.Equal(found, []string{"Dockerfile"}) {
		t.Errorf("%s holds %v, want exactly [Dockerfile]", shippedDir, found)
	}
}

// TestSyntaxDirectiveIsPinned pins the BuildKit frontend that reads each Dockerfile
// (build-packaging.md section 1). A bare docker/dockerfile:1.7 is a tag that can be moved under a
// build, and Dependabot never updates the line, so it is a literal reference pinned by digest. The
// shipped image must carry one; another Dockerfile may use the builder's default frontend, but if
// it names one, the same rule holds.
func TestSyntaxDirectiveIsPinned(t *testing.T) {
	t.Parallel()

	for _, path := range allDockerfiles(t) {
		syntax, ok := dockerfiles.Syntax(readRepoFile(t, path))
		if !ok {
			if path == shippedDockerfile {
				t.Errorf("%s has no syntax parser directive on its first line", path)
			}

			continue
		}

		if dockerfiles.Repository(syntax) != "docker/dockerfile" {
			t.Errorf("%s reads with the frontend %q, want docker/dockerfile", path, syntax)
		}

		if !dockerfiles.DigestPinned(syntax) {
			t.Errorf("%s reads with the frontend %q, which is not pinned by digest", path, syntax)
		}
	}
}

// TestShippedStages pins the three named stages, in order, each from a literal digest-pinned base:
// Dependabot updates only literal FROM lines, and a tag alone can be repointed under a build.
func TestShippedStages(t *testing.T) {
	t.Parallel()

	stages := shippedStages(t)

	names := make([]string, 0, len(stages))
	for _, stage := range stages {
		names = append(names, stage.Name)

		if !dockerfiles.DigestPinned(stage.Image) {
			t.Errorf("stage %q is FROM %q, which is not a literal reference pinned by digest",
				stage.Name, stage.Image)
		}
	}

	if !slices.Equal(names, []string{"web", "build", "runtime"}) {
		t.Errorf("the stages are %q, want exactly web, build and runtime, in that order", names)
	}
}

// TestBuildStages pins where the build stages run and what they start from. Both run on the build
// platform -- the SPA is architecture-free and Go cross-compiles -- so no emulation is needed. The
// golang tag follows .go-version, and the node major follows the Node line.
func TestBuildStages(t *testing.T) {
	t.Parallel()

	web := stage(t, "web")
	build := stage(t, "build")

	for _, check := range []struct {
		stage      dockerfiles.Stage
		repository string
	}{
		{web, "dhi.io/node"},
		{build, "dhi.io/golang"},
	} {
		if check.stage.Platform != "$BUILDPLATFORM" {
			t.Errorf("stage %s runs on --platform=%q, want $BUILDPLATFORM", check.stage.Name,
				check.stage.Platform)
		}

		if got := dockerfiles.Repository(check.stage.Image); got != check.repository {
			t.Errorf("stage %s is FROM %s, want %s", check.stage.Name, got, check.repository)
		}
	}

	goLine := strings.TrimSpace(readRepoFile(t, ".go-version"))
	if tag := dockerfiles.Tag(build.Image); !strings.HasPrefix(tag, goLine+"-") {
		t.Errorf("the build stage's golang tag is %q, want the %s line of .go-version", tag, goLine)
	}

	nodeLine := documentedNodeLine(t)
	if tag := dockerfiles.Tag(web.Image); !strings.HasPrefix(tag, nodeLine+"-") {
		t.Errorf("the web stage's node tag is %q, want the Node %s line", tag, nodeLine)
	}

	for _, workflow := range workflows(t) {
		for _, match := range regexp.MustCompile(`(?m)^\s*NODE_LINE:\s*"?(\d+)"?\s*$`).
			FindAllStringSubmatch(readRepoFile(t, workflow), -1) {
			if match[1] != nodeLine {
				t.Errorf(
					"%s sets NODE_LINE %s, but the image builds on Node %s",
					workflow,
					match[1],
					nodeLine,
				)
			}
		}
	}

	webInstructions := joined(web)
	for _, want := range []string{"RUN --mount=type=cache,target=/root/.npm,id=npmcache npm ci", "RUN npm run build"} {
		if !strings.Contains(webInstructions, want) {
			t.Errorf("the web stage does not %q:\n%s", want, webInstructions)
		}
	}

	buildInstructions := joined(build)
	for _, want := range []string{
		"ARG VERSION", "ARG COMMIT", "ARG DATE", "ARG TARGETOS", "ARG TARGETARCH",
		"CGO_ENABLED=0", "go mod download", "COPY --from=web /src/web/dist ./web/dist",
		"-trimpath", "-buildvcs=false", "-o /out/bitgauge ./cmd/bitgauge",
	} {
		if !strings.Contains(buildInstructions, want) {
			t.Errorf("the build stage lacks %q:\n%s", want, buildInstructions)
		}
	}
}

// TestRuntimeStage pins the posture of the image that ships (build-packaging.md section 1): no
// shell to run anything in, nothing to write to, an unprivileged numeric user, and the healthcheck
// in exec form.
func TestRuntimeStage(t *testing.T) {
	t.Parallel()

	runtime := stage(t, "runtime")

	if got := dockerfiles.Repository(runtime.Image); got != "dhi.io/static" {
		t.Errorf("the runtime stage is FROM %s, want dhi.io/static", got)
	}

	if runtime.Platform != "" {
		t.Errorf("the runtime stage pins --platform=%s; it has to follow the target platform",
			runtime.Platform)
	}

	want := map[string]string{
		"USER":        runtimeUser,
		"EXPOSE":      "8080",
		"HEALTHCHECK": healthcheck,
		"ENTRYPOINT":  `["/bitgauge"]`,
		"COPY":        "--from=build /out/bitgauge /bitgauge",
	}

	seen := map[string][]string{}

	for _, instruction := range runtime.Instructions {
		switch instruction.Keyword {
		case "RUN", "SHELL", "VOLUME", "WORKDIR", "ADD", "ENV":
			t.Errorf("the runtime stage carries %s %s; it has no shell and writes nothing",
				instruction.Keyword, instruction.Args)
		}

		seen[instruction.Keyword] = append(seen[instruction.Keyword], instruction.Args)
	}

	for keyword, args := range want {
		if !slices.Equal(seen[keyword], []string{args}) {
			t.Errorf(
				"the runtime stage has %s %q, want exactly %s %s",
				keyword,
				seen[keyword],
				keyword,
				args,
			)
		}
	}

	if !strings.Contains(
		readRepoFile(t, buildPackagingDoc),
		"`HEALTHCHECK "+healthcheckTimings+"`",
	) {
		t.Errorf("%s does not document the HEALTHCHECK timings %s", buildPackagingDoc,
			healthcheckTimings)
	}

	labels := dockerfiles.Labels(runtime)
	wantLabels := map[string]string{
		"org.opencontainers.image.title":       "bitgauge",
		"org.opencontainers.image.description": labels["org.opencontainers.image.description"],
		"org.opencontainers.image.source":      "https://github.com/leinardi/bitgauge",
		"org.opencontainers.image.version":     "${VERSION}",
		"org.opencontainers.image.revision":    "${COMMIT}",
		"org.opencontainers.image.created":     "${DATE}",
		"org.opencontainers.image.licenses":    "GPL-3.0-or-later",
	}

	if labels["org.opencontainers.image.description"] == "" {
		t.Error("the runtime stage has no org.opencontainers.image.description")
	}

	for key, value := range wantLabels {
		if labels[key] != value {
			t.Errorf("label %s is %q, want %q", key, labels[key], value)
		}
	}

	if len(labels) != len(wantLabels) {
		t.Errorf("the runtime stage carries labels %v, want exactly the seven OCI labels", labels)
	}
}

// TestBuildinfoIsStamped pins where the version comes from: internal/buildinfo, in the image and
// in make go-build alike. A path that stamped package main would ship a binary reporting "dev".
func TestBuildinfoIsStamped(t *testing.T) {
	t.Parallel()

	for _, path := range []string{shippedDockerfile, "Makefile"} {
		content := readRepoFile(t, path)

		for _, field := range []string{"version", "commit", "date"} {
			if !strings.Contains(
				content,
				"-X github.com/leinardi/bitgauge/internal/buildinfo."+field+"=",
			) &&
				!strings.Contains(
					content,
					"-X 'github.com/leinardi/bitgauge/internal/buildinfo."+field+"=",
				) {
				t.Errorf("%s does not stamp internal/buildinfo.%s", path, field)
			}
		}

		if strings.Contains(content, "main.version") {
			t.Errorf("%s stamps main.version, which no main package declares", path)
		}
	}
}

// TestOtherDockerfilesAreTestOnly pins that every other Dockerfile in the repository is pinned
// like the shipped one and is never built or released as a product image.
func TestOtherDockerfilesAreTestOnly(t *testing.T) {
	t.Parallel()

	makefile := readRepoFile(t, "Makefile")

	targets := regexp.MustCompile(`(?m)^DOCKER_TARGETS\s*:?=\s*(.*)$`).FindStringSubmatch(makefile)
	if len(targets) < 2 || strings.Join(strings.Fields(targets[1]), " ") != "bitgauge" {
		t.Errorf("DOCKER_TARGETS is %q, want exactly bitgauge", targets)
	}

	if !strings.Contains(makefile, "DOCKERFILE_bitgauge := "+shippedDockerfile+"\n") {
		t.Errorf("DOCKERFILE_bitgauge does not name %s", shippedDockerfile)
	}

	referrers := map[string]string{"Makefile": makefile}

	if content, ok := readOptional(t, releaseWorkflow); ok {
		referrers[releaseWorkflow] = content
	}

	for _, path := range allDockerfiles(t) {
		if path == shippedDockerfile {
			continue
		}

		stages, err := dockerfiles.Parse(readRepoFile(t, path))
		if err != nil {
			t.Errorf("%s: %v", path, err)

			continue
		}

		for _, stage := range stages {
			if !dockerfiles.DigestPinned(stage.Image) {
				t.Errorf(
					"%s: FROM %q is not a literal reference pinned by digest",
					path,
					stage.Image,
				)
			}
		}

		for referrer, content := range referrers {
			if strings.Contains(content, path) || strings.Contains(content, filepath.Base(path)) {
				t.Errorf(
					"%s references %s, which is a test image and never shipped",
					referrer,
					path,
				)
			}
		}
	}
}

// TestPlatforms pins the two platforms (decisions.md section 27) wherever a workflow names
// platforms: dhi.io/static has no arm/v7.
func TestPlatforms(t *testing.T) {
	t.Parallel()

	declaration := regexp.MustCompile(`(?mi)^\s*(?:-\s*)?(platforms?|PLATFORMS)\s*:\s*(.+)$`)

	for _, workflow := range workflows(t) {
		content := readRepoFile(t, workflow)

		for _, match := range declaration.FindAllStringSubmatch(content, -1) {
			value := strings.Trim(strings.TrimSpace(match[2]), `"'`)
			if strings.HasPrefix(value, "${{") {
				continue
			}

			if value != wantPlatforms {
				t.Errorf("%s declares %s %q, want %q", workflow, match[1], value, wantPlatforms)
			}
		}

		if strings.Contains(content, "linux/arm/v") || strings.Contains(content, "linux/386") {
			t.Errorf("%s names a platform other than %s", workflow, wantPlatforms)
		}
	}
}

// TestReleaseWorkflowIsAbsent is the release-content assertion in its form before the Release
// stage: release.yaml is written by that stage's activation commit, together with the assertions on
// its content (buildinfo stamping, PLATFORMS, the GHCR-only registry), which replace this test. A
// workflow that appears without them would publish unchecked.
func TestReleaseWorkflowIsAbsent(t *testing.T) {
	t.Parallel()

	if _, ok := readOptional(t, releaseWorkflow); ok {
		t.Errorf("%s exists, but the Release stage is not active: its activation commit "+
			"replaces this test with the release-content assertions", releaseWorkflow)
	}
}

// TestParseRejectsWhatTheAssertionsMustNotMiss is the negative control for the reader: each of
// these inputs has to come out as something the assertions above refuse.
func TestParseRejectsWhatTheAssertionsMustNotMiss(t *testing.T) {
	t.Parallel()

	const digest = "@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	for name, image := range map[string]string{
		"a tag only":              "dhi.io/static:20250419",
		"a variable tag":          "dhi.io/golang:${GO_LINE}-alpine3.23-dev" + digest,
		"a variable image":        "$BASE" + digest,
		"a short digest":          "dhi.io/static:20250419@sha256:0123",
		"a digest with no tag":    "dhi.io/static" + digest,
		"a stage name, not a ref": "build",
	} {
		if dockerfiles.DigestPinned(image) {
			t.Errorf("%s (%q) passes as digest-pinned", name, image)
		}
	}

	if !dockerfiles.DigestPinned("dhi.io/static:20250419" + digest) {
		t.Error("a literal tag plus digest does not pass as digest-pinned")
	}

	for name, image := range map[string]string{
		"no tag":                  "dhi.io/static",
		"latest":                  "dhi.io/static:latest",
		"latest, upper-cased":     "dhi.io/static:LATEST",
		"a tag plus digest":       "dhi.io/static:20250419" + digest,
		"a variable tag":          "dhi.io/golang:${GO_LINE}-alpine3.23-dev",
		"a variable image":        "$BASE",
		"an empty tag":            "dhi.io/static:",
		"a stage name, not a ref": "build",
	} {
		if dockerfiles.TagPinned(image) {
			t.Errorf("%s (%q) passes as pinned by an explicit tag alone", name, image)
		}
	}

	if !dockerfiles.TagPinned("dhi.io/golang:1.26-alpine3.23-dev") {
		t.Error("a literal explicit tag does not pass as tag-pinned")
	}

	for image, want := range map[string]bool{
		"dhi.io/static:20250419":                 true,
		"dhi.io/static:20250419" + digest:        false,
		"dhi.io/static:latest":                   false,
		"docker.io/library/alpine:3.23" + digest: true,
		"docker.io/library/alpine:3.23":          false,
		"evil.example/dhi.io/static:20250419":    false,
	} {
		if got := dockerfiles.BasePinned(image); got != want {
			t.Errorf("BasePinned(%q) = %v, want %v", image, got, want)
		}
	}

	stages, err := dockerfiles.Parse(
		"FROM a:1" + digest + " AS one\nRUN echo \\\n  two\n# note\nFROM b:2" + digest + "\nUSER 1:1\n",
	)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(stages) != 2 || stages[0].Name != "one" || stages[1].Name != "" ||
		joined(stages[0]) != "RUN echo two" || joined(stages[1]) != "USER 1:1" {
		t.Errorf("parsed %+v", stages)
	}

	for name, content := range map[string]string{
		"no directive":              "FROM a:1" + digest + "\n",
		"after a comment":           "# note\n# syntax=docker/dockerfile:1.7" + digest + "\n",
		"after a blank line":        "\n# syntax=docker/dockerfile:1.7" + digest + "\n",
		"after an instruction":      "FROM a:1" + digest + "\n# syntax=docker/dockerfile:1.7" + digest + "\n",
		"a directive with no value": "# syntax=\n",
	} {
		if syntax, ok := dockerfiles.Syntax(content); ok {
			t.Errorf("%s: read the syntax directive %q, which BuildKit ignores", name, syntax)
		}
	}

	syntax, ok := dockerfiles.Syntax(
		"# check=error=true\n#Syntax = docker/dockerfile:1.7" + digest + "\n",
	)
	if !ok || syntax != "docker/dockerfile:1.7"+digest {
		t.Errorf("a directive after another directive read as %q, %v", syntax, ok)
	}

	_, err = dockerfiles.Parse("FROM a:1" + digest + "\nRUN echo \\\n")
	if err == nil {
		t.Error("a file ending inside a continuation parsed")
	}
}

// documentedNodeLine reads the Node major from the web stage row of build-packaging.md section 1,
// which is where the Node line is decided until a workflow carries NODE_LINE.
func documentedNodeLine(t *testing.T) string {
	t.Helper()

	match := regexp.MustCompile("(?m)^\\| `web` \\| `dhi\\.io/node:(\\d+)-").
		FindStringSubmatch(readRepoFile(t, buildPackagingDoc))
	if match == nil {
		t.Fatalf("%s does not name the web stage's dhi.io/node line", buildPackagingDoc)
	}

	return match[1]
}

func shippedStages(t *testing.T) []dockerfiles.Stage {
	t.Helper()

	stages, err := dockerfiles.Parse(readRepoFile(t, shippedDockerfile))
	if err != nil {
		t.Fatalf("%s: %v", shippedDockerfile, err)
	}

	return stages
}

func stage(t *testing.T, name string) dockerfiles.Stage {
	t.Helper()

	var found []dockerfiles.Stage

	for _, candidate := range shippedStages(t) {
		if candidate.Name == name {
			found = append(found, candidate)
		}
	}

	if len(found) != 1 {
		t.Fatalf("%s has %d stages named %s, want one", shippedDockerfile, len(found), name)
	}

	return found[0]
}

func joined(stage dockerfiles.Stage) string {
	lines := make([]string, 0, len(stage.Instructions))
	for _, instruction := range stage.Instructions {
		lines = append(lines, instruction.Keyword+" "+instruction.Args)
	}

	return strings.Join(lines, "\n")
}

func isDockerfile(name string) bool {
	return name == "Dockerfile" || strings.HasSuffix(name, ".Dockerfile")
}

// allDockerfiles walks the repository for Dockerfiles, skipping installed and generated trees.
// Walking rather than asking git keeps a new file in the test cache key.
func allDockerfiles(t *testing.T) []string {
	t.Helper()

	root, err := os.OpenRoot(repoPath(t, "."))
	if err != nil {
		t.Fatalf("open the repository: %v", err)
	}

	defer root.Close()

	var found []string

	err = fs.WalkDir(root.FS(), ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "node_modules", "dist", ".cache", ".fallow":
				return fs.SkipDir
			}

			return nil
		}

		if isDockerfile(entry.Name()) {
			found = append(found, path)
		}

		return nil
	})
	if err != nil {
		t.Fatalf("walk the repository: %v", err)
	}

	if !slices.Contains(found, shippedDockerfile) {
		t.Fatalf(
			"the walk did not find %s, so it would find nothing else either",
			shippedDockerfile,
		)
	}

	return found
}

// workflows lists the workflow files that exist; there may be none yet.
func workflows(t *testing.T) []string {
	t.Helper()

	entries, err := os.ReadDir(repoPath(t, workflowsDir))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}

		t.Fatalf("read %s: %v", workflowsDir, err)
	}

	var found []string

	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".yaml") || strings.HasSuffix(entry.Name(), ".yml") {
			found = append(found, workflowsDir+"/"+entry.Name())
		}
	}

	return found
}

func repoPath(t *testing.T, rel string) string {
	t.Helper()

	path, err := filepath.Abs(filepath.Join("..", "..", filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("resolve %s: %v", rel, err)
	}

	return path
}

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()

	content, ok := readOptional(t, rel)
	if !ok {
		t.Fatalf("%s does not exist", rel)
	}

	return content
}

// readOptional reads a file that may not exist yet. Reading, or failing to, records the path in
// the test cache key either way.
func readOptional(t *testing.T, rel string) (string, bool) {
	t.Helper()

	data, err := os.ReadFile(repoPath(t, rel))
	if os.IsNotExist(err) {
		return "", false
	}

	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}

	return string(data), true
}
