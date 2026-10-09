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

// Package boundary_test pins the lint rules that keep the server stateless and silent: the
// no-storage and no-outbound depguard rules and the forbidigo set. A rule that stops matching fails
// nothing on its own -- the linter just goes quiet -- so this test reads the rules out of
// .golangci.yaml and checks them against the packages and identifiers they exist to stop, and
// against the neighbors the server legitimately needs.
package boundary_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

const (
	noStorage  = "no-storage"
	noOutbound = "no-outbound"

	healthcheckPath = "^cmd/bitgauge/healthcheck\\.go$"
	testPath        = "(_test\\.go$|^test/)"
)

// wantFiles is the exact scope of both rules: every file except tests and the test tree.
var wantFiles = []string{"$all", "!$test", "!${base-path}/test/**"}

// ruleKeys are the only settings the two rules may carry. depguard also reads allow and list-mode,
// and either one can exempt part of a denied tree without touching the deny list.
var ruleKeys = []string{"deny", "files"}

// mustDeny lists, per rule, packages the rule exists to stop.
var mustDeny = map[string][]string{
	noStorage: {
		"database/sql",
		"database/sql/driver",
		"modernc.org/sqlite",
		"github.com/mattn/go-sqlite3",
		"github.com/ncruces/go-sqlite3",
		"github.com/ncruces/go-sqlite3/driver",
		"go.etcd.io/bbolt",
		"github.com/dgraph-io/badger/v4",
		"github.com/cockroachdb/pebble",
		"github.com/syndtr/goleveldb/leveldb",
		"gorm.io/gorm",
		"gorm.io/driver/sqlite",
		"github.com/jmoiron/sqlx",
		"github.com/jackc/pgx/v5",
		"github.com/lib/pq",
		"github.com/go-sql-driver/mysql",
		"github.com/redis/go-redis/v9",
		"github.com/redis/rueidis",
		"github.com/pressly/goose/v3",
		"github.com/golang-migrate/migrate/v4",
	},
	noOutbound: {
		"net/smtp",
		"net/rpc",
		"net/rpc/jsonrpc",
		"net/http/cookiejar",
		"net/http/httputil",
		"golang.org/x/net/proxy",
		"golang.org/x/net/websocket",
		"github.com/gorilla/websocket",
		"github.com/miekg/dns",
		"google.golang.org/grpc",
		"google.golang.org/grpc/credentials",
		"github.com/go-resty/resty/v2",
		"github.com/hashicorp/go-retryablehttp",
		"github.com/prometheus/client_golang/api",
		"github.com/prometheus/client_golang/api/prometheus/v1",
		"github.com/prometheus/client_golang/prometheus/push",
	},
}

// neighbors are packages the server needs. A deny entry that also stops one of them would make the
// rule an obstacle, and is the first sign of a prefix that is too short.
var neighbors = []string{
	"net/http",
	"net",
	"net/netip",
	"net/url",
	"log/slog",
	"os",
	"crypto/rand",
	"embed",
	"github.com/prometheus/client_golang/prometheus",
	"github.com/prometheus/client_golang/prometheus/promhttp",
	"github.com/prometheus/client_golang/prometheus/collectors",
	"github.com/coder/websocket",
	"github.com/knadh/koanf/v2",
	"github.com/knadh/koanf/providers/env/v2",
	"github.com/go-chi/chi/v5",
	"github.com/go-chi/chi/v5/middleware",
}

// identifier is one selector a forbidigo rule is checked against: the expression as written and the
// import path of its package, which is what analyze-types matches pkg against.
type identifier struct {
	expr string
	pkg  string
}

var forbiddenIdentifiers = []identifier{
	{"http.Get", "net/http"},
	{"http.Post", "net/http"},
	{"http.NewRequestWithContext", "net/http"},
	{"http.Client", "net/http"},
	{"http.Transport", "net/http"},
	{"http.DefaultClient", "net/http"},
	{"net.Dial", "net"},
	{"net.Dialer", "net"},
	{"net.Resolver", "net"},
	{"net.LookupHost", "net"},
	{"net.LookupIP", "net"},
	{"tls.Dial", "crypto/tls"},
	{"tls.Dialer", "crypto/tls"},
	{"websocket.Dial", "github.com/coder/websocket"},
	{"os.WriteFile", "os"},
	{"os.Create", "os"},
	{"os.OpenFile", "os"},
	{"os.MkdirAll", "os"},
	{"os.Remove", "os"},
	{"os.Rename", "os"},
	{"syscall.Open", "syscall"},
	{"syscall.Write", "syscall"},
	{"fmt.Println", "fmt"},
	{"println", ""},
}

var allowedIdentifiers = []identifier{
	{"http.ListenAndServe", "net/http"},
	{"http.Server", "net/http"},
	{"http.NewResponseController", "net/http"},
	{"http.MaxBytesReader", "net/http"},
	{"http.HandlerFunc", "net/http"},
	{"net.Listen", "net"},
	{"net.ParseIP", "net"},
	{"os.ReadFile", "os"},
	{"os.Getenv", "os"},
	{"os.Open", "os"},
	{"websocket.Accept", "github.com/coder/websocket"},
	{"tls.Config", "crypto/tls"},
	{"fmt.Errorf", "fmt"},
	{"fmt.Fprintf", "fmt"},
}

type depguardRule struct {
	Files []string `yaml:"files"`
	Deny  []struct {
		Pkg  string `yaml:"pkg"`
		Desc string `yaml:"desc"`
	} `yaml:"deny"`
}

type forbidRule struct {
	Pattern string `yaml:"pattern"`
	Pkg     string `yaml:"pkg"`
	Msg     string `yaml:"msg"`
}

type exclusionRule struct {
	Path    string   `yaml:"path"`
	Text    string   `yaml:"text"`
	Linters []string `yaml:"linters"`
}

type golangciConfig struct {
	Linters struct {
		Default  string   `yaml:"default"`
		Disable  []string `yaml:"disable"`
		Settings struct {
			Depguard struct {
				Rules map[string]yaml.Node `yaml:"rules"`
			} `yaml:"depguard"`
			// A map rather than a struct: forbidigo's keys are kebab-case, which a struct tag
			// would have to spell against the repository's tag-naming lint.
			Forbidigo map[string]yaml.Node `yaml:"forbidigo"`
		} `yaml:"settings"`
		Exclusions struct {
			Generated string          `yaml:"generated"`
			Paths     []string        `yaml:"paths"`
			Rules     []exclusionRule `yaml:"rules"`
		} `yaml:"exclusions"`
	} `yaml:"linters"`
}

// TestBoundaryLintersRun pins that depguard and forbidigo actually run: a rule that is never
// evaluated stops nothing, and every other test here would still pass.
func TestBoundaryLintersRun(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	if config.Linters.Default != "all" {
		t.Errorf("linters.default is %q, want all", config.Linters.Default)
	}

	for _, linter := range []string{"depguard", "forbidigo"} {
		if slices.Contains(config.Linters.Disable, linter) {
			t.Errorf("%s is disabled, so the boundary rules never run", linter)
		}
	}

	if config.Linters.Exclusions.Generated != "strict" {
		t.Errorf(
			"exclusions.generated is %q, want strict: lax skips any file that merely mentions generated code",
			config.Linters.Exclusions.Generated,
		)
	}
}

// TestRulesHaveOnlyDenyAndFiles pins that neither rule carries a setting that could weaken it
// unseen.
func TestRulesHaveOnlyDenyAndFiles(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	for _, name := range []string{noStorage, noOutbound} {
		node := ruleNode(t, config, name)

		var settings map[string]any

		err := node.Decode(&settings)
		if err != nil {
			t.Fatalf("decode depguard rule %q: %v", name, err)
		}

		for key := range settings {
			if !slices.Contains(ruleKeys, key) {
				t.Errorf("depguard rule %q sets %q: only %v are checked here", name, key, ruleKeys)
			}
		}
	}
}

// TestRulesCoverEveryNonTestFile pins the scope: a narrower files list leaves production code
// outside the rule.
func TestRulesCoverEveryNonTestFile(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	for _, name := range []string{noStorage, noOutbound} {
		rule := decodeRule(t, config, name)
		if !slices.Equal(rule.Files, wantFiles) {
			t.Errorf("depguard rule %q applies to %v, want exactly %v", name, rule.Files, wantFiles)
		}

		if len(rule.Deny) == 0 {
			t.Errorf("depguard rule %q has an empty deny list", name)
		}

		for _, entry := range rule.Deny {
			if strings.TrimSpace(entry.Desc) == "" {
				t.Errorf("depguard rule %q: deny entry %q has no desc", name, entry.Pkg)
			}
		}
	}
}

// TestRulesDenyKnownBadPackages checks each rule against the packages it exists to stop.
func TestRulesDenyKnownBadPackages(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	for name, paths := range mustDeny {
		deny := denied(decodeRule(t, config, name))

		for _, path := range paths {
			if !isDenied(path, deny) {
				t.Errorf("%s must be denied by depguard rule %q (deny list: %v)", path, name, deny)
			}
		}
	}
}

// TestRulesSpareNeighbors checks the other direction: a prefix that is too short denies packages
// the server needs.
func TestRulesSpareNeighbors(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	for _, name := range []string{noStorage, noOutbound} {
		deny := denied(decodeRule(t, config, name))

		for _, path := range neighbors {
			if isDenied(path, deny) {
				t.Errorf("%s is needed by the server but depguard rule %q denies it", path, name)
			}
		}
	}
}

// TestForbidigoPatterns compiles the forbidigo set and checks it against identifiers it must
// forbid and identifiers the server needs.
func TestForbidigoPatterns(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)
	settings := config.Linters.Settings.Forbidigo

	analyzeTypes := settings["analyze-types"]
	if analyzeTypes.Value != "true" {
		t.Error(
			"forbidigo analyze-types must be true, or pkg is ignored and aliased imports slip through",
		)
	}

	forbidNode := settings["forbid"]

	var forbid []forbidRule

	err := forbidNode.Decode(&forbid)
	if err != nil {
		t.Fatalf("decode forbidigo forbid: %v", err)
	}

	rules := make([]compiledRule, 0, len(forbid))

	for _, rule := range forbid {
		if strings.TrimSpace(rule.Msg) == "" {
			t.Errorf("forbidigo pattern %q has no msg", rule.Pattern)
		}

		rules = append(rules, compile(t, rule))
	}

	for _, ident := range forbiddenIdentifiers {
		if !forbidden(rules, ident) {
			t.Errorf("forbidigo must forbid %s (package %q)", ident.expr, ident.pkg)
		}
	}

	for _, ident := range allowedIdentifiers {
		if forbidden(rules, ident) {
			t.Errorf(
				"forbidigo forbids %s (package %q), which the server needs",
				ident.expr,
				ident.pkg,
			)
		}
	}
}

// TestForbidigoExclusions pins that the only non-test file exempt from forbidigo is the
// healthcheck subcommand, and that web/ is the only excluded path.
func TestForbidigoExclusions(t *testing.T) {
	t.Parallel()

	config := loadConfig(t)

	var paths []string

	for _, rule := range config.Linters.Exclusions.Rules {
		if rule.Path != "" && len(rule.Linters) == 0 {
			t.Errorf(
				"exclusion rule for path %q names no linter, so it silences every linter there",
				rule.Path,
			)
		}

		if !slices.Contains(rule.Linters, "forbidigo") &&
			!slices.Contains(rule.Linters, "depguard") {
			continue
		}

		if rule.Text != "" || len(rule.Linters) != 1 || rule.Linters[0] != "forbidigo" {
			t.Errorf("exclusion rule %+v must exclude forbidigo alone, by path only", rule)
		}

		paths = append(paths, rule.Path)
	}

	sort.Strings(paths)

	want := []string{testPath, healthcheckPath}
	sort.Strings(want)

	if !slices.Equal(paths, want) {
		t.Errorf("forbidigo exclusions are %q, want exactly %q", paths, want)
	}

	checkPathRegexp(
		t,
		healthcheckPath,
		[]string{"cmd/bitgauge/healthcheck.go"},
		[]string{
			"cmd/bitgauge/main.go",
			"internal/server/healthcheck.go",
			"cmd/bitgauge/healthcheck.go.bak",
		},
	)
	checkPathRegexp(
		t,
		testPath,
		[]string{
			"internal/handlers/download_test.go",
			"test/image/image_test.go",
			"test/internal/testenv/env.go",
		},
		[]string{"internal/handlers/download.go", "internal/test/x.go", "cmd/bitgauge/main.go"},
	)

	if !slices.Equal(config.Linters.Exclusions.Paths, []string{"web/"}) {
		t.Errorf("excluded paths are %q, want exactly [web/]", config.Linters.Exclusions.Paths)
	}
}

// TestLinterReportsViolationsOutsideTests runs golangci-lint on a scratch module with this
// repository's configuration: a violation under internal/ must be reported, and the same code in a
// _test.go file must not.
func TestLinterReportsViolationsOutsideTests(t *testing.T) {
	t.Parallel()

	linter := toolgate.Lookup(t, toolgate.GolangciLint)

	configData, err := os.ReadFile(filepath.Join(toolgate.RepoRoot(t), ".golangci.yaml"))
	if err != nil {
		t.Fatalf("read .golangci.yaml: %v", err)
	}

	dir := t.TempDir()

	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("open the scratch module: %v", err)
	}

	t.Cleanup(func() { _ = root.Close() })

	writeFile(t, root, ".golangci.yaml", string(configData))
	writeFile(t, root, "go.mod", "module github.com/leinardi/bitgauge\n\ngo 1.26.0\n")
	writeFile(t, root, filepath.Join("internal", "x", "x.go"), scratchSource("Violations"))
	writeFile(
		t,
		root,
		filepath.Join("internal", "x", "x_test.go"),
		scratchSource("violationsInTest"),
	)
	writeFile(t, root, filepath.Join("test", "y", "y.go"), scratchSource("ViolationsInTestTree"))

	// The configuration as written decides which linters run: an --enable-only here would turn a
	// disabled depguard or forbidigo back on and hide exactly the regression this test is for.
	cmd := exec.CommandContext(
		t.Context(),
		linter,
		"run",
		"--max-issues-per-linter=0",
		"--max-same-issues=0",
		// One issue per line would let another linter's finding on the same line hide the boundary's.
		"--uniq-by-line=false",
		"./...",
	)
	cmd.Dir = dir

	cmd.Env = append(os.Environ(), "GOFLAGS=-mod=mod")

	out, _ := cmd.CombinedOutput()
	output := string(out)

	for _, want := range []string{
		"x.go:4:2: import 'database/sql' is not allowed from list 'no-storage'",
		"use of `http.Get` forbidden",
		"use of `os.WriteFile` forbidden",
		"use of `net.Dial` forbidden",
	} {
		if !strings.Contains(output, want) {
			t.Errorf("golangci-lint output lacks %q:\n%s", want, output)
		}
	}

	for line := range strings.SplitSeq(output, "\n") {
		exempt := strings.Contains(line, "x_test.go") ||
			strings.Contains(line, filepath.Join("test", "y"))
		boundary := strings.Contains(line, "(depguard)") || strings.Contains(line, "(forbidigo)")

		if exempt && boundary {
			t.Errorf(
				"golangci-lint applied a boundary rule to a test file, which the rules exempt: %s",
				line,
			)
		}
	}
}

func scratchSource(function string) string {
	return `package x

import (
	"database/sql"
	"net"
	"net/http"
	"os"
)

func ` + function + `() {
	_ = sql.ErrNoRows
	_, _ = http.Get("http://192.0.2.1/")
	_ = os.WriteFile("result.json", nil, 0o600)
	_, _ = net.Dial("tcp", "192.0.2.1:80")
}
`
}

type compiledRule struct {
	pattern *regexp.Regexp
	pkg     *regexp.Regexp
}

func compile(t *testing.T, rule forbidRule) compiledRule {
	t.Helper()

	pattern, err := regexp.Compile(rule.Pattern)
	if err != nil {
		t.Fatalf("forbidigo pattern %q does not compile: %v", rule.Pattern, err)
	}

	compiled := compiledRule{pattern: pattern, pkg: nil}

	if rule.Pkg != "" {
		compiled.pkg, err = regexp.Compile(rule.Pkg)
		if err != nil {
			t.Fatalf("forbidigo pkg %q does not compile: %v", rule.Pkg, err)
		}
	}

	return compiled
}

func forbidden(rules []compiledRule, ident identifier) bool {
	for _, rule := range rules {
		if !rule.pattern.MatchString(ident.expr) {
			continue
		}

		if rule.pkg == nil || rule.pkg.MatchString(ident.pkg) {
			return true
		}
	}

	return false
}

func checkPathRegexp(t *testing.T, expr string, match, noMatch []string) {
	t.Helper()

	re, err := regexp.Compile(expr)
	if err != nil {
		t.Fatalf("exclusion path %q does not compile: %v", expr, err)
	}

	for _, path := range match {
		if !re.MatchString(path) {
			t.Errorf("exclusion path %q must match %s", expr, path)
		}
	}

	for _, path := range noMatch {
		if re.MatchString(path) {
			t.Errorf("exclusion path %q must not match %s", expr, path)
		}
	}
}

// isDenied reports whether depguard v2 would deny path under the given deny list. It mirrors
// strInPrefixList in depguard's settings.go: the list is sorted, the one entry that would sort
// immediately before path is the only candidate, and a trailing $ asks for an exact match rather
// than a prefix. Checking against a copy of the algorithm rather than a plain HasPrefix loop keeps
// a subtlety of the real matcher -- only one candidate is ever tried -- from hiding a gap.
func isDenied(path string, deny []string) bool {
	sorted := slices.Clone(deny)
	sort.Strings(sorted)

	index := sort.Search(len(sorted), func(i int) bool {
		return strings.TrimRight(sorted[i], "$") > path
	}) - 1
	if index < 0 {
		return false
	}

	candidate := sorted[index]
	if exact, ok := strings.CutSuffix(candidate, "$"); ok {
		return path == exact
	}

	// depguard's own next step, not an addition: an entry with neither a dot nor a slash is taken
	// for a standard-library package, which can never prefix an import path that has a dot in it.
	if !strings.ContainsAny(candidate, "./") && strings.ContainsRune(path, '.') {
		return false
	}

	return strings.HasPrefix(path, candidate)
}

func denied(rule depguardRule) []string {
	deny := make([]string, 0, len(rule.Deny))
	for _, entry := range rule.Deny {
		deny = append(deny, entry.Pkg)
	}

	return deny
}

func loadConfig(t *testing.T) *golangciConfig {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(toolgate.RepoRoot(t), ".golangci.yaml"))
	if err != nil {
		t.Fatalf("read .golangci.yaml: %v", err)
	}

	var config golangciConfig

	err = yaml.Unmarshal(data, &config)
	if err != nil {
		t.Fatalf("parse .golangci.yaml: %v", err)
	}

	return &config
}

func ruleNode(t *testing.T, config *golangciConfig, name string) yaml.Node {
	t.Helper()

	node, ok := config.Linters.Settings.Depguard.Rules[name]
	if !ok {
		t.Fatalf("depguard rule %q is missing from .golangci.yaml", name)
	}

	return node
}

func decodeRule(t *testing.T, config *golangciConfig, name string) depguardRule {
	t.Helper()

	node := ruleNode(t, config, name)

	var rule depguardRule

	err := node.Decode(&rule)
	if err != nil {
		t.Fatalf("decode depguard rule %q: %v", name, err)
	}

	return rule
}

func writeFile(t *testing.T, root *os.Root, name, content string) {
	t.Helper()

	err := root.MkdirAll(filepath.Dir(name), 0o750)
	if err != nil {
		t.Fatalf("create %s: %v", filepath.Dir(name), err)
	}

	err = root.WriteFile(name, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}
