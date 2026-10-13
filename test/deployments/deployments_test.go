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

// Package deployments_test keeps the deployment examples in deployments/examples runnable as
// documented: every compose file parses and hardens BitGauge as deployment-example.md does, with
// the healthcheck timings of build-packaging.md section 1, and every code block of
// deployment-example.md that names a shipped file is that file, byte for byte, so the page and the
// examples cannot drift apart. It reads files only; nothing here runs a container.
package deployments_test

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/leinardi/bitgauge/internal/config"
)

const (
	examplesDir       = "deployments/examples"
	exampleDoc        = "docs/features/deployment-example.md"
	buildPackagingDoc = "docs/features/technical-stack/build-packaging.md"
	// exampleLinkPrefix is how deployment-example.md links a shipped example file.
	exampleLinkPrefix = "../../" + examplesDir + "/"
	// image is the release tag the examples pin: the latest 0.x (release.md).
	image = "ghcr.io/leinardi/bitgauge:0"
	// port is the one port BitGauge listens on in every example (the image's EXPOSE).
	port = "8080"
	// service is BitGauge's service name in every compose file, which the proxies address.
	service = "bitgauge"
)

var (
	// docFiles are the example files deployment-example.md shows in full, one code block each.
	docFiles = []string{
		"compose-alone/compose.yaml",
		"traefik/compose.yaml",
		"traefik/traefik-dynamic.yaml",
		"caddy/Caddyfile",
		"nginx/bitgauge.conf",
	}
	// composeFiles are every example's compose file. The Caddy and nginx ones are not on the page,
	// which shows only those proxies' own configuration, so they are held to the same rules here.
	composeFiles = []string{
		"compose-alone/compose.yaml",
		"traefik/compose.yaml",
		"caddy/compose.yaml",
		"nginx/compose.yaml",
	}
	// proxyTargets are the lines that send each proxy to BitGauge on its port.
	proxyTargets = map[string]string{
		"caddy/Caddyfile":     "reverse_proxy " + service + ":" + port + " {",
		"nginx/bitgauge.conf": "proxy_pass http://" + service + ":" + port + ";",
	}

	healthcheckRule = regexp.MustCompile(
		"`HEALTHCHECK --interval=(\\S+) --timeout=(\\S+) --start-period=(\\S+) --retries=(\\d+)`")
	fenceLine   = regexp.MustCompile("^```")
	exampleLink = regexp.MustCompile(`\]\((` + regexp.QuoteMeta(exampleLinkPrefix) + `[^)#]+)\)`)
)

// TestExamplesAreTheListedFiles pins the tree: each example directory holds its README and the
// files this test knows, so a new file cannot ship unchecked.
func TestExamplesAreTheListedFiles(t *testing.T) {
	t.Parallel()

	want := map[string]bool{}

	for _, rel := range slices.Concat(docFiles, composeFiles) {
		want[rel] = true
		want[path.Join(path.Dir(rel), "README.md")] = true
	}

	var got []string

	root := repoPath(t, examplesDir)

	err := filepath.WalkDir(root, func(file string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}

		rel, relErr := filepath.Rel(root, file)
		if relErr != nil {
			return fmt.Errorf("relative path of %s: %w", file, relErr)
		}

		got = append(got, filepath.ToSlash(rel))

		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", examplesDir, err)
	}

	for _, rel := range got {
		if !want[rel] {
			t.Errorf("%s/%s is not a file this test checks", examplesDir, rel)
		}
	}

	for rel := range want {
		if !slices.Contains(got, rel) {
			t.Errorf("%s/%s is missing", examplesDir, rel)
		}
	}
}

// TestReadmesLinkTheSpec checks that every example's README points at the page it comes from.
func TestReadmesLinkTheSpec(t *testing.T) {
	t.Parallel()

	for _, rel := range composeFiles {
		readme := path.Join(examplesDir, path.Dir(rel), "README.md")
		if !strings.Contains(readRepoFile(t, readme), "](../../../"+exampleDoc+"#") {
			t.Errorf("%s does not link a section of %s", readme, exampleDoc)
		}
	}
}

// TestComposeFilesHardenBitGauge holds BitGauge's service in every compose file to
// deployment-example.md section 1 and build-packaging.md section 1.
func TestComposeFilesHardenBitGauge(t *testing.T) {
	t.Parallel()

	timings := documentedTimings(t)

	for _, rel := range composeFiles {
		for _, problem := range hardeningProblems(readRepoFile(t, path.Join(examplesDir, rel)), timings) {
			t.Errorf("%s/%s: %s", examplesDir, rel, problem)
		}
	}
}

// TestHardeningProblemsCatchesWeakenedFiles proves the check above is not blind.
func TestHardeningProblemsCatchesWeakenedFiles(t *testing.T) {
	t.Parallel()

	timings := documentedTimings(t)
	good := readRepoFile(t, path.Join(examplesDir, "compose-alone/compose.yaml"))

	if problems := hardeningProblems(good, timings); len(problems) != 0 {
		t.Fatalf("the shipped file has problems %q", problems)
	}

	for name, edit := range map[string][2]string{
		"writable root":     {"read_only: true", "read_only: false"},
		"capabilities kept": {"cap_drop: [ALL]", "cap_drop: [NET_RAW]"},
		"privileges gained": {"no-new-privileges:true", "seccomp:unconfined"},
		"another image":     {image, "ghcr.io/leinardi/bitgauge:latest"},
		"shell healthcheck": {`["CMD", "/bitgauge", "healthcheck"]`, `["CMD-SHELL", "/bitgauge healthcheck"]`},
		"faster interval":   {"interval: 30s", "interval: 10s"},
		"fewer retries":     {"retries: 3", "retries: 1"},
		"another port":      {`"8080:8080"`, `"8080:9090"`},
		"a volume":          {"    # volumes:\n    #   -", "    volumes:\n      -"},
	} {
		weakened := strings.Replace(good, edit[0], edit[1], 1)
		if weakened == good {
			t.Fatalf("%s: %q is not in the shipped file", name, edit[0])
		}

		if len(hardeningProblems(weakened, timings)) == 0 {
			t.Errorf("%s: no problem found", name)
		}
	}
}

// TestComposeEnvironmentsValidate loads each compose file's BitGauge environment through the
// configuration package and requires no problem, so an example cannot set a key this release
// rejects at startup (configuration.md section 4, exit status 2).
func TestComposeEnvironmentsValidate(t *testing.T) {
	t.Parallel()

	for _, rel := range composeFiles {
		bitgauge := mapping(mapping(parseCompose(t, rel)["services"])[service])

		for _, problem := range configProblems(t, mapping(bitgauge["environment"])) {
			t.Errorf("%s/%s: BitGauge would exit 2: %s", examplesDir, rel, problem)
		}
	}
}

// TestConfigProblemsIsNotBlind proves the check above reaches the validator: a toggle for a layer
// this release does not ship, and a key that does not exist, are both refused.
func TestConfigProblemsIsNotBlind(t *testing.T) {
	t.Parallel()

	for name, environment := range map[string]map[string]any{
		"a later release's layer": {"BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED": "true"},
		"an unknown key":          {"BITGAUGE_SERVER__NO_SUCH_KEY": "1"},
		"an invalid value":        {"BITGAUGE_SERVER__PUBLIC_URL": "speed.example.lan"},
	} {
		if len(configProblems(t, environment)) == 0 {
			t.Errorf("%s: no problem found", name)
		}
	}
}

// configProblems loads a compose environment as BitGauge would, with no configuration file, and
// returns every decode and validation problem.
func configProblems(t *testing.T, environment map[string]any) []string {
	t.Helper()

	environ := make([]string, 0, len(environment))
	for key, value := range environment {
		environ = append(environ, key+"="+fmt.Sprint(value))
	}

	loaded, err := config.LoadFrom(filepath.Join(t.TempDir(), "absent.yaml"), false, environ)
	if err != nil {
		t.Fatalf("load %v: %v", environ, err)
	}

	checked := config.Check(&loaded)
	problems := make([]string, 0, len(checked))

	for _, problem := range checked {
		problems = append(
			problems,
			fmt.Sprintf("%s=%s: %s", problem.Key, problem.Value, problem.Rule),
		)
	}

	return problems
}

// TestProxiesTrustOnlyThemselves checks that each proxy reaches BitGauge on its port and is the
// one trusted proxy, at the fixed address its compose file gives it (security.md section 4).
func TestProxiesTrustOnlyThemselves(t *testing.T) {
	t.Parallel()

	for rel, target := range proxyTargets {
		if !containsTrimmedLine(readRepoFile(t, path.Join(examplesDir, rel)), target) {
			t.Errorf("%s/%s does not proxy to %s:%s", examplesDir, rel, service, port)
		}
	}

	for _, rel := range composeFiles[1:] {
		file := parseCompose(t, rel)
		bitgauge := mapping(mapping(file["services"])[service])
		proxies := 0

		for name, raw := range mapping(file["services"]) {
			if name == service {
				continue
			}

			proxies++

			address := proxyAddress(mapping(raw))
			trusted := fmt.Sprint(
				mapping(bitgauge["environment"])["BITGAUGE_SERVER__TRUSTED_PROXIES"],
			)

			if address == "" || trusted != address+"/32" {
				t.Errorf(
					"%s: trusted_proxies is %q, want %q, the %s address",
					rel,
					trusted,
					address+"/32",
					name,
				)
			}
		}

		if proxies != 1 {
			t.Errorf("%s has %d services besides %s, want its one proxy", rel, proxies, service)
		}
	}

	traefik := mapping(mapping(parseCompose(t, "traefik/compose.yaml")["services"])[service])
	if got := mapping(traefik["labels"])["traefik.http.services.bitgauge.loadbalancer.server.port"]; got != port {
		t.Errorf("traefik/compose.yaml sends Traefik to port %v, want %s", got, port)
	}
}

// TestDocBlocksAreShippedFiles checks that each code block deployment-example.md introduces with
// a link to an example file is that file, and that every file the page shows is linked so.
func TestDocBlocksAreShippedFiles(t *testing.T) {
	t.Parallel()

	blocks, problems := linkedBlocks(readRepoFile(t, exampleDoc))
	for _, problem := range problems {
		t.Errorf("%s: %s", exampleDoc, problem)
	}

	named := make([]string, 0, len(blocks))

	for _, block := range blocks {
		rel := strings.TrimPrefix(block.link, exampleLinkPrefix)
		named = append(named, rel)

		if shipped := readRepoFile(t, path.Join(examplesDir, rel)); shipped != block.body {
			t.Errorf(
				"%s:%d: the block differs from %s/%s",
				exampleDoc,
				block.line,
				examplesDir,
				rel,
			)
		}
	}

	slices.Sort(named)

	want := slices.Sorted(slices.Values(docFiles))
	if !slices.Equal(named, want) {
		t.Errorf("%s shows %v, want %v", exampleDoc, named, want)
	}
}

// TestLinkedBlocksIsNotBlind proves the block reader on a scratch page.
func TestLinkedBlocksIsNotBlind(t *testing.T) {
	t.Parallel()

	page := strings.Join([]string{
		"# Page",
		"",
		"Shipped as [`a`](" + exampleLinkPrefix + "a/compose.yaml):",
		"",
		"```yaml",
		"services: {}",
		"```",
		"",
		"Not shipped:",
		"",
		"```text",
		"anything",
		"```",
		"",
		"Two at once: [x](" + exampleLinkPrefix + "x/a) and [y](" + exampleLinkPrefix + "y/b):",
		"",
		"```text",
		"ambiguous",
		"```",
		"",
		"Unclosed [`b`](" + exampleLinkPrefix + "b/Caddyfile):",
		"",
		"```text",
		"open",
	}, "\n")

	blocks, problems := linkedBlocks(page)

	if len(blocks) != 1 || blocks[0].link != exampleLinkPrefix+"a/compose.yaml" ||
		blocks[0].body != "services: {}\n" || blocks[0].line != 5 {
		t.Errorf("blocks = %+v, want the one block of a/compose.yaml at line 5", blocks)
	}

	want := []string{
		"line 17: the block's paragraph links 2 example files, want one",
		"line 23: the block is never closed",
	}
	if !slices.Equal(problems, want) {
		t.Errorf("problems = %q, want %q", problems, want)
	}
}

// block is a fenced code block of the page and the example file its paragraph links.
type block struct {
	link string
	body string
	line int
}

// linkedBlocks returns the fenced blocks whose preceding paragraph links an example file, with
// what is wrong with the page: a paragraph that links more than one, or a block left open.
func linkedBlocks(page string) (blocks []block, problems []string) {
	var paragraph []string

	all := lines(page)

	for index := 0; index < len(all); index++ {
		if !fenceLine.MatchString(all[index]) {
			if strings.TrimSpace(all[index]) == "" {
				if len(paragraph) > 0 && index+1 < len(all) && fenceLine.MatchString(all[index+1]) {
					continue // a paragraph and its block, one blank line apart
				}

				paragraph = nil
			} else {
				paragraph = append(paragraph, all[index])
			}

			continue
		}

		start := index
		links := exampleLink.FindAllStringSubmatch(strings.Join(paragraph, "\n"), -1)
		paragraph = nil

		end := slices.IndexFunc(all[start+1:], fenceLine.MatchString)
		if end < 0 {
			problems = append(problems, fmt.Sprintf("line %d: the block is never closed", start+1))

			break
		}

		index = start + 1 + end
		body := strings.Join(all[start+1:index], "\n") + "\n"

		switch len(links) {
		case 0:
		case 1:
			blocks = append(blocks, block{link: links[0][1], body: body, line: start + 1})
		default:
			problems = append(problems, fmt.Sprintf(
				"line %d: the block's paragraph links %d example files, want one",
				start+1,
				len(links),
			))
		}
	}

	return blocks, problems
}

// hardeningProblems lists how a compose file's BitGauge service departs from the documented one.
func hardeningProblems(content string, timings map[string]string) []string {
	var file map[string]any

	err := yaml.Unmarshal([]byte(content), &file)
	if err != nil {
		return []string{"does not parse: " + err.Error()}
	}

	bitgauge := mapping(mapping(file["services"])[service])
	if bitgauge == nil {
		return []string{"has no " + service + " service"}
	}

	var problems []string

	check := func(ok bool, format string, args ...any) {
		if !ok {
			problems = append(problems, fmt.Sprintf(format, args...))
		}
	}

	check(bitgauge["image"] == image, "image is %v, want %s", bitgauge["image"], image)
	check(bitgauge["read_only"] == true, "read_only is %v, want true", bitgauge["read_only"])
	check(slices.Equal(scalars(bitgauge["cap_drop"]), []string{"ALL"}),
		"cap_drop is %v, want [ALL]", bitgauge["cap_drop"])
	check(slices.Contains(scalars(bitgauge["security_opt"]), "no-new-privileges:true"),
		"security_opt %v lacks no-new-privileges:true", bitgauge["security_opt"])
	check(bitgauge["volumes"] == nil, "mounts volumes %v: BitGauge writes nothing and needs none",
		bitgauge["volumes"])
	check(bitgauge["tmpfs"] == nil, "mounts a tmpfs: BitGauge writes nothing and needs none")

	for _, published := range scalars(bitgauge["ports"]) {
		check(
			strings.HasSuffix(published, ":"+port),
			"publishes %s, want the container's port %s",
			published,
			port,
		)
	}

	_, listens := mapping(bitgauge["environment"])["BITGAUGE_SERVER__LISTEN"]
	check(!listens, "moves server.listen off :%s", port)

	healthcheck := mapping(bitgauge["healthcheck"])
	check(
		slices.Equal(scalars(healthcheck["test"]), []string{"CMD", "/bitgauge", "healthcheck"}),
		"healthcheck test is %v, want the exec form [CMD /bitgauge healthcheck]",
		healthcheck["test"],
	)

	for key, want := range timings {
		check(
			fmt.Sprint(healthcheck[key]) == want,
			"healthcheck %s is %v, want %s",
			key,
			healthcheck[key],
			want,
		)
	}

	return problems
}

// documentedTimings reads the healthcheck timings from build-packaging.md section 1, keyed as a
// compose healthcheck names them.
func documentedTimings(t *testing.T) map[string]string {
	t.Helper()

	match := healthcheckRule.FindStringSubmatch(readRepoFile(t, buildPackagingDoc))
	if match == nil {
		t.Fatalf("%s does not document the HEALTHCHECK timings", buildPackagingDoc)
	}

	retries, err := strconv.Atoi(match[4])
	if err != nil {
		t.Fatalf("retries %q: %v", match[4], err)
	}

	return map[string]string{
		"interval":     match[1],
		"timeout":      match[2],
		"start_period": match[3],
		"retries":      strconv.Itoa(retries),
	}
}

// proxyAddress is the fixed IPv4 address a proxy service takes on its one network.
func proxyAddress(proxy map[string]any) string {
	for _, network := range mapping(proxy["networks"]) {
		if address, ok := mapping(network)["ipv4_address"].(string); ok {
			return address
		}
	}

	return ""
}

func parseCompose(t *testing.T, rel string) map[string]any {
	t.Helper()

	var file map[string]any

	err := yaml.Unmarshal([]byte(readRepoFile(t, path.Join(examplesDir, rel))), &file)
	if err != nil {
		t.Fatalf("%s/%s: %v", examplesDir, rel, err)
	}

	return file
}

// mapping is a YAML mapping, or nil for anything else.
func mapping(value any) map[string]any {
	result, _ := value.(map[string]any)

	return result
}

// scalars is a YAML sequence of scalars as strings, or nil for anything else.
func scalars(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}

	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, fmt.Sprint(item))
	}

	return result
}

func containsTrimmedLine(content, want string) bool {
	return slices.ContainsFunc(lines(content), func(line string) bool {
		return strings.TrimSpace(line) == strings.TrimSpace(want)
	})
}

func lines(content string) []string {
	return strings.Split(strings.TrimSuffix(content, "\n"), "\n")
}

func repoPath(t *testing.T, rel string) string {
	t.Helper()

	abs, err := filepath.Abs(filepath.Join("..", "..", filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("resolve %s: %v", rel, err)
	}

	return abs
}

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()

	data, err := os.ReadFile(repoPath(t, rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}

	return string(data)
}
