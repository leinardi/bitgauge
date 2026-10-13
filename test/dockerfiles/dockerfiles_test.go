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
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

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
	// releaseImage is the one image release.yaml publishes, on the one registry it publishes to
	// (build-packaging.md section 6).
	releaseImage = "ghcr.io/leinardi/bitgauge"
	// The release tools' pins; test/toolchain/pins_test.go holds the same values.
	svuPin   = "v3.4.1"
	trivyPin = "v0.75.0"
	// The actions whose inputs decide where the release pushes.
	loginAction     = "docker/login-action"
	buildPushAction = "docker/build-push-action"
	attestAction    = "actions/attest-build-provenance"
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

// TestShippedStages pins the three named stages, in order, each from a literal dhi.io base pinned
// by an explicit tag and no digest (build-packaging.md section 1): Dependabot updates only literal
// FROM lines, a missing or latest tag says nothing about what is built, and dhi.io republishes its
// tags to ship security fixes, which a digest would hold back.
func TestShippedStages(t *testing.T) {
	t.Parallel()

	stages := shippedStages(t)

	names := make([]string, 0, len(stages))
	for _, stage := range stages {
		names = append(names, stage.Name)

		if !dockerfiles.FromDHI(stage.Image) || !dockerfiles.TagPinned(stage.Image) {
			t.Errorf("stage %q is FROM %q, which is not a literal dhi.io reference pinned by an "+
				"explicit tag alone", stage.Name, stage.Image)
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
		for _, problem := range stampProblems(path, readRepoFile(t, path)) {
			t.Error(problem)
		}
	}
}

// stampProblems lists the internal/buildinfo fields a build file does not stamp, and a stamp of
// main.version, which no main package declares.
func stampProblems(path, content string) []string {
	var problems []string

	for _, field := range []string{"version", "commit", "date"} {
		flag := "github.com/leinardi/bitgauge/internal/buildinfo." + field + "="
		if !strings.Contains(content, "-X "+flag) && !strings.Contains(content, "-X '"+flag) {
			problems = append(problems, fmt.Sprintf(
				"%s does not stamp internal/buildinfo.%s", path, field))
		}
	}

	if strings.Contains(content, "main.version") {
		problems = append(problems, path+" stamps main.version, which no main package declares")
	}

	return problems
}

// TestOtherDockerfilesAreTestOnly pins that every other Dockerfile in the repository follows the
// shipped one's pinning rule (a dhi.io base by an explicit tag alone, any other base by tag and
// digest) and is never built or released as a product image.
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
			if !dockerfiles.BasePinned(stage.Image) {
				t.Errorf(
					"%s: FROM %q is neither a dhi.io reference pinned by an explicit tag alone "+
						"nor another literal reference pinned by tag and digest",
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

// TestReleaseWorkflow pins what release.yaml publishes and how (docs/release.md,
// build-packaging.md sections 2, 4 and 6): the binaries stamp internal/buildinfo, the image is
// built for exactly the two platforms, GHCR is the only registry anything is pushed to and
// ghcr.io/leinardi/bitgauge the only image there, and the tools, actions and images it runs are
// pinned.
func TestReleaseWorkflow(t *testing.T) {
	t.Parallel()

	for _, problem := range releaseProblems(readRepoFile(t, releaseWorkflow)) {
		t.Error(problem)
	}
}

// TestReleaseChecksRefuseMutations is the negative control of TestReleaseWorkflow: release.yaml
// with one rule broken at a time has to come out with a problem.
func TestReleaseChecksRefuseMutations(t *testing.T) {
	t.Parallel()

	content := readRepoFile(t, releaseWorkflow)

	for _, mutation := range []struct{ name, old, new string }{
		{"buildinfo.commit stamped elsewhere", "internal/buildinfo.commit=", "main.commit="},
		{"a third platform", "PLATFORMS: " + wantPlatforms, "PLATFORMS: " + wantPlatforms + ",linux/arm/v7"},
		{"the image on Docker Hub", "IMAGE: " + releaseImage, "IMAGE: docker.io/leinardi/bitgauge"},
		{"another GHCR image", `-t "$IMAGE:latest"`, `-t "$IMAGE:latest" -t "ghcr.io/leinardi/other:latest"`},
		{"a pointer on another image", `-t "$IMAGE:latest"`, `-t "$MIRROR:latest"`},
		{"a login to another registry", "registry: dhi.io", "registry: quay.io"},
		{"the build pushed to GHCR", "name=${{ env.LOCAL_IMAGE }}", "name=${{ env.IMAGE }}"},
		{"the build tagged by the push input", "sbom: true", "sbom: true\n          push: true"},
		{"a copy to another image", `"docker://$IMAGE@$DIGEST"`, `"docker://$MIRROR@$DIGEST"`},
		{"a signature on another image", `cosign sign --yes "$IMAGE@`, `cosign sign --yes "$MIRROR@`},
		{"an attestation pushed elsewhere", "subject-name: ${{ env.IMAGE }}", "subject-name: ${{ env.LOCAL_IMAGE }}"},
		{"another Trivy", "TRIVY_VERSION: " + trivyPin, "TRIVY_VERSION: v0.74.0"},
		{"another svu", "SVU_VERSION: " + svuPin, "SVU_VERSION: v3.4.0"},
		{"an action by tag", "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v7"},
		{"an action with no version comment", "@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4.2.2", "@4d101475d8b20a2381f78447822ac1eab6504dd8"},
		{"the registry image by tag", "REGISTRY_IMAGE: registry:3.1.2@", "REGISTRY_IMAGE: registry:3.1.2 # "},
	} {
		mutated := strings.Replace(content, mutation.old, mutation.new, 1)
		if mutated == content {
			t.Errorf("%s: %s does not contain %q, so the control checks nothing",
				mutation.name, releaseWorkflow, mutation.old)

			continue
		}

		// A mutation that broke the YAML would pass on the parse error alone, checking no rule.
		problems := releaseProblems(mutated)
		if len(problems) == 0 || strings.HasPrefix(problems[0], "parse ") {
			t.Errorf("%s: the release checks find %q, want a broken rule", mutation.name, problems)
		}
	}
}

// releaseDoc is the part of release.yaml the release checks read.
type releaseDoc struct {
	Env  map[string]string     `yaml:"env"`
	Jobs map[string]releaseJob `yaml:"jobs"`
}

type releaseJob struct {
	Steps []releaseStep `yaml:"steps"`
}

type releaseStep struct {
	With map[string]string `yaml:"with"`
	Uses string            `yaml:"uses"`
	Run  string            `yaml:"run"`
}

var envReference = regexp.MustCompile(`\$\{\{\s*env\.(\w+)\s*\}\}`)

// steps lists the steps of every job, in job name order.
func (doc releaseDoc) steps() []releaseStep {
	names := make([]string, 0, len(doc.Jobs))
	for name := range doc.Jobs {
		names = append(names, name)
	}

	sort.Strings(names)

	var steps []releaseStep
	for _, name := range names {
		steps = append(steps, doc.Jobs[name].Steps...)
	}

	return steps
}

// expand replaces each ${{ env.NAME }} in value with the workflow's env value.
func (doc releaseDoc) expand(value string) string {
	return envReference.ReplaceAllStringFunc(value, func(reference string) string {
		return doc.Env[envReference.FindStringSubmatch(reference)[1]]
	})
}

// action is the uses: value without its @ref.
func (step releaseStep) action() string {
	action, _, _ := strings.Cut(step.Uses, "@")

	return action
}

// releaseProblems lists every way release.yaml content breaks the release rules.
func releaseProblems(content string) []string {
	var doc releaseDoc

	err := yaml.Unmarshal([]byte(content), &doc)
	if err != nil {
		return []string{fmt.Sprintf("parse %s: %v", releaseWorkflow, err)}
	}

	problems := stampProblems(releaseWorkflow, content)
	problems = append(problems, releasePlatformProblems(doc, content)...)
	problems = append(problems, releaseReferenceProblems(doc, content)...)
	problems = append(problems, releaseStepProblems(doc)...)
	problems = append(problems, releaseRunProblems(doc)...)

	return append(problems, releasePinProblems(doc, content)...)
}

// releasePlatformProblems: one image build, for exactly the two platforms PLATFORMS declares.
func releasePlatformProblems(doc releaseDoc, content string) []string {
	var problems []string

	if doc.Env["PLATFORMS"] != wantPlatforms {
		problems = append(problems, fmt.Sprintf("%s declares PLATFORMS %q, want %q",
			releaseWorkflow, doc.Env["PLATFORMS"], wantPlatforms))
	}

	builds := 0

	for _, step := range doc.steps() {
		if step.action() != buildPushAction {
			continue
		}

		builds++

		if got := doc.expand(step.With["platforms"]); got != wantPlatforms {
			problems = append(problems, fmt.Sprintf("%s builds the image for %q, want %q",
				releaseWorkflow, got, wantPlatforms))
		}
	}

	if builds != 1 {
		problems = append(problems, fmt.Sprintf("%s builds the image %d times, want once",
			releaseWorkflow, builds))
	}

	if strings.Contains(content, "linux/arm/v") || strings.Contains(content, "linux/386") {
		problems = append(problems, releaseWorkflow+" names a platform other than "+wantPlatforms)
	}

	return problems
}

var (
	ghcrReference = regexp.MustCompile(`ghcr\.io/[\w./-]+`)
	otherRegistry = regexp.MustCompile(
		`(?i)docker\.io|hub\.docker\.com|docker push|docker\.pkg\.github\.com`,
	)
)

// releaseReferenceProblems: the image is ghcr.io/leinardi/bitgauge, no other GHCR image is named,
// and nothing names Docker Hub or pushes with docker push.
func releaseReferenceProblems(doc releaseDoc, content string) []string {
	var problems []string

	if doc.Env["IMAGE"] != releaseImage {
		problems = append(problems, fmt.Sprintf("%s publishes IMAGE %q, want %q",
			releaseWorkflow, doc.Env["IMAGE"], releaseImage))
	}

	for _, reference := range ghcrReference.FindAllString(content, -1) {
		if reference != releaseImage {
			problems = append(problems, fmt.Sprintf("%s names the GHCR image %s, want only %s",
				releaseWorkflow, reference, releaseImage))
		}
	}

	for _, mention := range otherRegistry.FindAllString(content, -1) {
		problems = append(problems, fmt.Sprintf("%s names %q; GHCR is the only registry published",
			releaseWorkflow, mention))
	}

	for _, name := range []string{"LOCAL_IMAGE", "COPY_IMAGE"} {
		if !strings.HasPrefix(doc.Env[name], "localhost:") {
			problems = append(problems, fmt.Sprintf("%s sets %s %q, not a job-local registry",
				releaseWorkflow, name, doc.Env[name]))
		}
	}

	return problems
}

var outputName = regexp.MustCompile(`(?:^|,)name=([^,]+)`)

// releaseStepProblems: the actions that can push do so only where they may. A login is to GHCR or
// to dhi.io, the pull-only source of the build stages; the image build pushes only to the
// job-local registry, by digest; a pushed attestation is on the GHCR image.
func releaseStepProblems(doc releaseDoc) []string {
	var problems []string

	for _, step := range doc.steps() {
		switch step.action() {
		case loginAction:
			if registry := step.With["registry"]; registry != "ghcr.io" && registry != "dhi.io" {
				problems = append(problems, fmt.Sprintf("%s logs in to %q, want ghcr.io or dhi.io",
					releaseWorkflow, registry))
			}
		case buildPushAction:
			if step.With["push"] == "true" || step.With["tags"] != "" {
				problems = append(problems, releaseWorkflow+
					" builds the image with the push or tags input; it pushes only by digest")
			}

			names := outputName.FindAllStringSubmatch(doc.expand(step.With["outputs"]), -1)
			for _, name := range names {
				if !strings.HasPrefix(name[1], "localhost:") {
					problems = append(problems, fmt.Sprintf(
						"%s builds the image into %s, not the job-local registry",
						releaseWorkflow, name[1]))
				}
			}

			if len(names) == 0 {
				problems = append(
					problems,
					releaseWorkflow+" builds the image into no named registry",
				)
			}
		case attestAction:
			subject := doc.expand(step.With["subject-name"])
			if step.With["push-to-registry"] == "true" && subject != releaseImage {
				problems = append(problems, fmt.Sprintf("%s pushes an attestation to %q, want %s",
					releaseWorkflow, subject, releaseImage))
			}
		}
	}

	return problems
}

var (
	pointerTarget = regexp.MustCompile(`\s-t\s+(\S+)`)
	copyTarget    = regexp.MustCompile(`docker://(\S+)`)
	signTarget    = regexp.MustCompile(`cosign sign\b.*\s(\S+)\s*$`)
	allowedCopy   = []string{"$IMAGE@", "$LOCAL_IMAGE@", "$COPY_IMAGE@"}
)

// releaseRunProblems: in the scripts, every image tag is set on $IMAGE, every skopeo reference is
// $IMAGE or a job-local registry, and cosign signs $IMAGE.
func releaseRunProblems(doc releaseDoc) []string {
	var problems []string

	for _, step := range doc.steps() {
		for line := range strings.SplitSeq(step.Run, "\n") {
			if strings.Contains(line, "imagetools create") {
				for _, target := range pointerTarget.FindAllStringSubmatch(line, -1) {
					if !strings.HasPrefix(target[1], `"$IMAGE:`) {
						problems = append(problems, fmt.Sprintf("%s tags %s, not $IMAGE",
							releaseWorkflow, target[1]))
					}
				}
			}

			for _, target := range copyTarget.FindAllStringSubmatch(line, -1) {
				if !slices.ContainsFunc(allowedCopy, func(prefix string) bool {
					return strings.HasPrefix(target[1], prefix)
				}) {
					problems = append(problems, fmt.Sprintf("%s copies to or from docker://%s",
						releaseWorkflow, target[1]))
				}
			}

			if target := signTarget.FindStringSubmatch(line); len(target) == 2 &&
				!strings.HasPrefix(target[1], `"$IMAGE@`) {
				problems = append(problems, fmt.Sprintf("%s signs %s, not $IMAGE",
					releaseWorkflow, target[1]))
			}
		}
	}

	return problems
}

var (
	usesLine       = regexp.MustCompile(`(?m)^[ \t]*(?:-[ \t]*)?uses:[ \t]*(\S+)(.*)$`)
	pinnedAction   = regexp.MustCompile(`^[\w.-]+/[\w./-]+@[0-9a-f]{40}$`)
	versionComment = regexp.MustCompile(`^[ \t]+#[ \t]*v\d+(?:\.\d+)*[ \t]*$`)
)

// releasePinProblems: svu and Trivy at their pins, the images the job runs pinned by digest, and
// every action pinned by a full commit SHA with its version in a trailing comment.
func releasePinProblems(doc releaseDoc, content string) []string {
	var problems []string

	for name, pin := range map[string]string{"SVU_VERSION": svuPin, "TRIVY_VERSION": trivyPin} {
		if doc.Env[name] != pin {
			problems = append(problems, fmt.Sprintf("%s sets %s %q, want %s",
				releaseWorkflow, name, doc.Env[name], pin))
		}
	}

	for _, name := range []string{"REGISTRY_IMAGE", "SKOPEO_IMAGE"} {
		if !dockerfiles.DigestPinned(doc.Env[name]) {
			problems = append(problems, fmt.Sprintf("%s runs %s %q, which is not pinned by digest",
				releaseWorkflow, name, doc.Env[name]))
		}
	}

	uses := usesLine.FindAllStringSubmatch(content, -1)
	if len(uses) == 0 {
		problems = append(problems, releaseWorkflow+" uses no action, so the pin check saw nothing")
	}

	for _, use := range uses {
		if strings.HasPrefix(use[1], "./") {
			continue
		}

		if !pinnedAction.MatchString(use[1]) || !versionComment.MatchString(use[2]) {
			problems = append(problems, fmt.Sprintf(
				"%s uses %s%s; want a full commit SHA and a trailing # vX.Y.Z comment",
				releaseWorkflow, use[1], use[2]))
		}
	}

	return problems
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
