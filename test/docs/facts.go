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

package docs

import (
	"regexp"
	"slices"
	"sort"
	"strings"
)

// NativeEndpoints are the only paths under /api/v1 (wire-protocol.md section 2).
var NativeEndpoints = []string{"download", "upload", "ping", "small", "ws", "info"}

// UploadKeys is the exact key set of the upload telemetry object (wire-protocol.md section 4).
var UploadKeys = []string{
	"epoch",
	"bucketMs",
	"firstBucket",
	"buckets",
	"bytes",
	"startMs",
	"durationMs",
}

// uploadOnlyKeys mark an object as upload telemetry rather than another object that happens to
// carry a bucketMs, such as the limits of GET /info or a result's series.
var uploadOnlyKeys = []string{"epoch", "firstBucket", "buckets", "startMs", "durationMs"}

var (
	apiPath = regexp.MustCompile(`/api/v1/([A-Za-z0-9_.-]+)`)
	// jsonKey reads a JSON object; shorthandKey the {a, b[], c} form diagrams use.
	jsonKey      = regexp.MustCompile(`"([A-Za-z]+)"\s*:`)
	shorthandKey = regexp.MustCompile(`\b([A-Za-z]+)\b(?:\[\])?\s*[,}]`)
)

// Fact is a number several pages state, checked wherever a pattern finds it. Want is the only
// value its capture groups (whichever one matched) may hold, and the pattern must match at least once, so rewording
// a page so the fact is no longer recognized fails rather than passing on nothing.
type Fact struct {
	Name    string
	Pattern *regexp.Regexp
	Want    string
}

// Facts grows as drift appears; free-text numeric agreement is not attempted beyond it.
var Facts = []Fact{
	{"bucketMs in JSON", regexp.MustCompile(`"bucketMs":\s*(\d+)`), "100"},
	{"bucket width in prose", regexp.MustCompile(`(\d+) ms buckets?\b`), "100"},
	{
		"upload buckets per request",
		regexp.MustCompile(`(?:[Aa]t most (\d+) entries|≤ (\d+) integers|exceeds (\d+) cells)`),
		"1201",
	},
	{"upload lifetime in cells", regexp.MustCompile(`120 s \((\d+) cells\)`), "1200"},
	{"upload lifetime in JSON", regexp.MustCompile(`"uploadLifetimeMs":\s*(\d+)`), "120000"},
	{"default listen port", regexp.MustCompile(`listen: ":(\d+)"`), "8080"},
}

// Mismatch is a fact found with the wrong value.
type Mismatch struct {
	Fact string
	Got  string
	Line int
}

// CheckFact returns every place in content where fact holds another value, and how many times it
// was found at all.
func CheckFact(fact Fact, content string) (mismatches []Mismatch, found int) {
	for index, line := range strings.Split(content, "\n") {
		for _, match := range fact.Pattern.FindAllStringSubmatch(line, -1) {
			found++

			got := strings.Join(match[1:], "")
			if got != fact.Want {
				mismatches = append(
					mismatches,
					Mismatch{Fact: fact.Name, Got: got, Line: index + 1},
				)
			}
		}
	}

	return mismatches, found
}

// RejectedAPIPaths are /api/v1 paths the contract names only to record that they were not chosen.
var RejectedAPIPaths = []string{
	"/api/v1/metrics", // decisions.md section 7: metrics live at the root, outside the versioned API
}

// APIPaths returns every /api/v1/<name> in content whose name is not a native endpoint, and how
// many /api/v1 paths it found at all.
func APIPaths(content string) (unknown []string, found int) {
	for _, match := range apiPath.FindAllStringSubmatch(content, -1) {
		found++

		if !slices.Contains(NativeEndpoints, match[1]) &&
			!slices.Contains(RejectedAPIPaths, match[0]) {
			unknown = append(unknown, match[0])
		}
	}

	return unknown, found
}

// UploadObjects returns the key set of every brace-delimited object in content that carries
// bucketMs together with an upload-only key: JSON objects in code blocks and the {a, b, c}
// shorthand used in diagrams alike. Nested objects are separated by depth, so only the keys
// directly inside each object count.
func UploadObjects(content string) [][]string {
	var (
		objects [][]string
		stack   []int
	)

	for offset, char := range content {
		switch char {
		case '{':
			stack = append(stack, offset)
		case '}':
			if len(stack) == 0 {
				continue
			}

			start := stack[len(stack)-1]
			stack = stack[:len(stack)-1]

			keys := directKeys(content[start+1 : offset+1])
			if slices.Contains(keys, "bucketMs") && containsAny(keys, uploadOnlyKeys) {
				objects = append(objects, keys)
			}
		}
	}

	return objects
}

// directKeys returns the keys of an object body (with its closing brace), skipping nested objects
// and arrays.
func directKeys(body string) []string {
	var flat strings.Builder

	depth := 0

	for _, char := range body {
		switch char {
		case '{', '[':
			depth++
		case '}', ']':
			if depth > 0 {
				depth--

				if char == ']' && depth == 0 {
					flat.WriteString("[]")
				}

				continue
			}
		}

		if depth == 0 {
			flat.WriteRune(char)
		}
	}

	keyPattern := shorthandKey
	if strings.Contains(flat.String(), "\":") {
		keyPattern = jsonKey
	}

	seen := map[string]bool{}

	for _, match := range keyPattern.FindAllStringSubmatch(flat.String(), -1) {
		seen[match[1]] = true
	}

	keys := make([]string, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	return keys
}

func containsAny(keys, wanted []string) bool {
	for _, key := range wanted {
		if slices.Contains(keys, key) {
			return true
		}
	}

	return false
}
