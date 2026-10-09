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

package toolchain_test

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// engineWiring are the only engine files that may touch the browser's clock, network and worker
// globals (frontend.md section 2).
var engineWiring = []string{
	"src/engine/clock.ts",
	"src/engine/transport.ts",
	"src/engine/worker.ts",
}

// TestEngineBoundaryConfig pins the shape of the boundary in web/eslint.config.ts, so it is checked
// even where ESLint is not installed.
func TestEngineBoundaryConfig(t *testing.T) {
	t.Parallel()

	config := readRepoFile(t, "web", "eslint.config.ts")

	wiring := "const engineWiringFiles = ['" + strings.Join(engineWiring, "', '") + "']"
	if !strings.Contains(config, wiring) {
		t.Errorf(
			"web/eslint.config.ts must exempt exactly %v from the banned globals:\nwant %s",
			engineWiring,
			wiring,
		)
	}

	for _, global := range []string{
		"'performance'", "'setTimeout'", "'setInterval'", "'fetch'",
		"'XMLHttpRequest'", "'WebSocket'", "'window'", "'document'", "'self'",
	} {
		if !strings.Contains(config, global) {
			t.Errorf("web/eslint.config.ts does not ban %s in the engine", global)
		}
	}

	for _, rule := range []string{
		"rules: { 'no-restricted-imports': ['error', appRestrictedImports] }",
		"rules: { 'no-restricted-imports': ['error', engineRestrictedImports] }",
		"rules: { 'no-restricted-globals': ['error', ...engineBannedGlobals] }",
	} {
		if !strings.Contains(config, rule) {
			t.Errorf("web/eslint.config.ts lacks %s", rule)
		}
	}
}

// TestEngineBoundaryLint lints sources through ESLint's stdin, so no file is written under src/:
// each case names the file it pretends to be and whether the boundary must reject it.
func TestEngineBoundaryLint(t *testing.T) {
	t.Parallel()

	eslint := toolgate.Lookup(t, toolgate.ESLint)
	webDir := filepath.Join(toolgate.RepoRoot(t), "web")

	for name, test := range map[string]struct {
		file   string
		source string
		want   string
	}{
		"engine imports vue": {
			"src/engine/run.ts", "import { ref } from 'vue'\nexport const a = ref\n", "framework-free",
		},
		"engine imports application code": {
			"src/engine/run.ts", "import g from '@/components/Gauge.vue'\nexport const a = g\n", "only from itself",
		},
		"engine climbs out with a relative path": {
			"src/engine/upload/run.ts", "import { x } from '../../composables/useRun'\nexport const a = x\n", "@/engine/",
		},
		"engine calls fetch": {"src/engine/run.ts", "export const a = () => fetch('/x')\n", "fetch"},
		"engine reads performance": {
			"src/engine/stats/clock.ts", "export const now = () => performance.now()\n", "performance",
		},
		"engine sets a timer":      {"src/engine/run.ts", "export const a = () => setTimeout(() => 0, 1)\n", "setTimeout"},
		"engine opens a WebSocket": {"src/engine/run.ts", "export const a = () => new WebSocket('ws://x')\n", "WebSocket"},
		"app imports engine internals": {
			"src/composables/useRun.ts", "import { run } from '@/engine/run'\nexport const a = run\n", "messages.ts",
		},
		"app imports an engine barrel": {
			"src/composables/useRun.ts", "import { run } from '@/engine'\nexport const a = run\n", "messages.ts",
		},
		"app imports engine internals relatively": {
			"src/pages/Test.vue", "<script setup lang=\"ts\">\nimport { run } from '../engine/run'\nconsole.log(run)\n</script>\n", "messages.ts",
		},
		"engine imports itself and the generated types": {
			"src/engine/run.ts",
			"import { tm95 } from '@/engine/stats/tm95'\nimport { b } from './buckets'\nimport type { Info } from '@/api/types.gen'\n" +
				"export const a = [tm95, b] as unknown as Info\n",
			"",
		},
		"engine stamps the wall-clock start": {
			"src/engine/run.ts", "export const startedAt = () => new Date().toISOString()\n", "",
		},
		"production clock reads performance": {"src/engine/clock.ts", "export const now = () => performance.now()\n", ""},
		"production transport fetches":       {"src/engine/transport.ts", "export const get = () => fetch('/x')\n", ""},
		"app imports the message types": {
			"src/composables/useRun.ts", "import type { Command } from '@/engine/messages'\nexport type A = Command\n", "",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			//nolint:gosec // G204: test.file comes from the literal case table above, never from input.
			cmd := exec.CommandContext(
				t.Context(),
				eslint,
				"--stdin",
				"--stdin-filename",
				test.file,
			)
			cmd.Dir = webDir
			cmd.Stdin = strings.NewReader(test.source)

			out, err := cmd.CombinedOutput()
			output := string(out)

			if test.want == "" {
				if err != nil {
					t.Errorf("%s was rejected, want accepted: %v\n%s", test.file, err, output)
				}

				return
			}

			if err == nil || !strings.Contains(output, test.want) {
				t.Errorf("%s was not rejected for %q: %v\n%s", test.file, test.want, err, output)
			}
		})
	}
}
