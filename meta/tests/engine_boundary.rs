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

//! The engine stays framework-free (AGENTS.md), and the eslint configuration is what enforces it:
//! the engine and the demo import no Vue or application code and reach no browser I/O global
//! outside the production clock, transport and worker, and the app imports only
//! `engine/messages.ts`. Each case lints a source through eslint's stdin, so nothing is written
//! under `web/src/`, as the file it pretends to be, and names the rule message that must reject
//! it, or none when it must be accepted.
//!
//! eslint is a gated tool: when `web/node_modules/.bin/eslint` is missing the test returns early
//! with a note, and `BITGAUGE_REQUIRE_TOOLS=1` (set in CI) turns that into a failure, since a test
//! that skips passes in exactly the place it is meant to guard.

use std::env;
use std::io::{ErrorKind, Write};
use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

use meta::repo;

/// The variable that turns a missing tool from an early return into a failure.
const REQUIRE_ENV: &str = "BITGAUGE_REQUIRE_TOOLS";

/// The cases: the file a source pretends to be, the source, and the text the rejection must
/// contain, empty when the source must be accepted.
const CASES: &[(&str, &str, &str)] = &[
    // engine imports vue
    (
        "src/engine/run.ts",
        "import { ref } from 'vue'\nexport const a = ref\n",
        "framework-free",
    ),
    // engine imports application code
    (
        "src/engine/run.ts",
        "import g from '@/components/Gauge.vue'\nexport const a = g\n",
        "only from itself",
    ),
    // engine climbs out with a relative path
    (
        "src/engine/upload/run.ts",
        "import { x } from '../../composables/useRun'\nexport const a = x\n",
        "@/engine/",
    ),
    // engine calls fetch
    (
        "src/engine/run.ts",
        "export const a = () => fetch('/x')\n",
        "fetch",
    ),
    // engine reads performance
    (
        "src/engine/stats/clock.ts",
        "export const now = () => performance.now()\n",
        "performance",
    ),
    // engine sets a timer
    (
        "src/engine/run.ts",
        "export const a = () => setTimeout(() => 0, 1)\n",
        "setTimeout",
    ),
    // engine opens a WebSocket
    (
        "src/engine/run.ts",
        "export const a = () => new WebSocket('ws://x')\n",
        "WebSocket",
    ),
    // app imports engine internals
    (
        "src/composables/useRun.ts",
        "import { run } from '@/engine/run'\nexport const a = run\n",
        "messages.ts",
    ),
    // app imports an engine barrel
    (
        "src/composables/useRun.ts",
        "import { run } from '@/engine'\nexport const a = run\n",
        "messages.ts",
    ),
    // app imports engine internals relatively
    (
        "src/pages/Test.vue",
        "<script setup lang=\"ts\">\nimport { run } from '../engine/run'\nconsole.log(run)\n\
         </script>\n",
        "messages.ts",
    ),
    // engine imports itself and the generated types
    (
        "src/engine/run.ts",
        "import { tm95 } from '@/engine/stats/tm95'\nimport { b } from './buckets'\nimport type \
         { Info } from '@/api/types.gen'\nexport const a = [tm95, b] as unknown as Info\n",
        "",
    ),
    // engine stamps the wall-clock start
    (
        "src/engine/run.ts",
        "export const startedAt = () => new Date().toISOString()\n",
        "",
    ),
    // production clock reads performance
    (
        "src/engine/clock.ts",
        "export const now = () => performance.now()\n",
        "",
    ),
    // production transport fetches
    (
        "src/engine/transport.ts",
        "export const get = () => fetch('/x')\n",
        "",
    ),
    // demo imports application code
    (
        "src/demo/session.ts",
        "import { x } from '@/composables/useRun'\nexport const a = x\n",
        "only the engine, the demo",
    ),
    // demo imports vue
    (
        "src/demo/session.ts",
        "import { ref } from 'vue'\nexport const a = ref\n",
        "framework-free",
    ),
    // demo climbs out with a relative path
    (
        "src/demo/test/play.ts",
        "import { x } from '../../composables/useRun'\nexport const a = x\n",
        "@/demo/",
    ),
    // demo panel imports engine internals
    (
        "src/demo/DemoPanel.vue",
        "<script setup lang=\"ts\">\nimport { Run } from '@/engine/run'\nconsole.log(Run)\n\
         </script>\n",
        "messages.ts",
    ),
    // demo sets a timer
    (
        "src/demo/link.ts",
        "export const a = () => setTimeout(() => 0, 1)\n",
        "setTimeout",
    ),
    // demo fetches
    (
        "src/demo/transport.ts",
        "export const get = () => fetch('/x')\n",
        "fetch",
    ),
    // demo entry posts messages
    (
        "src/demo/worker.ts",
        "export const post = () => self.postMessage(1)\n",
        "",
    ),
    // demo imports the engine, itself and the generated types
    (
        "src/demo/session.ts",
        "import { Run } from '@/engine/run'\nimport { Link } from '@/demo/link'\nimport type { \
         Info } from '@/api/types.gen'\nexport const a = [Run, Link] as unknown as Info\n",
        "",
    ),
    // app imports a message union's own file
    (
        "src/composables/useRun.ts",
        "import type { Result } from '@/engine/messages/result'\nexport type A = Result\n",
        "messages.ts",
    ),
    // messages.ts re-exports the unions
    (
        "src/engine/messages.ts",
        "export type * from '@/engine/messages/result'\nexport type { Notice } from \
         '@/engine/messages/notices'\n",
        "",
    ),
    // app imports the message types
    (
        "src/composables/useRun.ts",
        "import type { Command } from '@/engine/messages'\nexport type A = Command\n",
        "",
    ),
];

/// The eslint that `npm ci` installed, found as `web/node_modules/.bin/eslint` in the nearest
/// ancestor of the working directory that has one; `None`, with a note, when there is none and
/// `REQUIRE_ENV` is not 1.
///
/// # Panics
///
/// eslint is missing and `REQUIRE_ENV` is 1, or a candidate path cannot be inspected.
fn eslint() -> Option<PathBuf> {
    let start =
        env::current_dir().unwrap_or_else(|error| panic!("read the working directory: {error}"));
    let found = start.ancestors().find_map(|directory| {
        let candidate = directory.join("web/node_modules/.bin/eslint");
        match candidate.metadata() {
            Ok(_) => Some(candidate),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => panic!("stat {}: {error}", candidate.display()),
        }
    });
    if found.is_none() {
        let reason = "web/node_modules/.bin/eslint: not installed; run npm ci in web/";
        assert!(
            env::var_os(REQUIRE_ENV).is_none_or(|value| value != "1"),
            "eslint is required ({REQUIRE_ENV}=1) but was not found: {reason}"
        );
        eprintln!("note: eslint not found ({reason}); set {REQUIRE_ENV}=1 to make this a failure");
    }
    found
}

/// What is wrong with eslint's verdict on one case, if anything.
fn case_problem(eslint: &PathBuf, (file, source, want): &(&str, &str, &str)) -> Option<String> {
    let mut child = Command::new(eslint)
        .args(["--stdin", "--stdin-filename", file])
        .current_dir(repo::path("web"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|error| panic!("run eslint on {file}: {error}"));
    child
        .stdin
        .take()
        .unwrap_or_else(|| panic!("eslint's stdin for {file}"))
        .write_all(source.as_bytes())
        .unwrap_or_else(|error| panic!("write {file} to eslint: {error}"));
    let output = child
        .wait_with_output()
        .unwrap_or_else(|error| panic!("wait for eslint on {file}: {error}"));
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let rejected = !output.status.success();
    if want.is_empty() {
        return rejected.then(|| {
            format!(
                "{file} was rejected, want accepted: {}\n{text}",
                output.status
            )
        });
    }
    (!rejected || !text.contains(want)).then(|| {
        format!(
            "{file} was not rejected for {want:?}: {}\n{text}",
            output.status
        )
    })
}

/// Runs `run` on every item, on as many threads as the machine has cores, in item order.
fn parallel_map<T: Sync, R: Send>(items: &[T], run: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let workers = thread::available_parallelism()
        .map_or(1, NonZeroUsize::get)
        .min(items.len());
    let mut results: Vec<(usize, R)> = thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let mut done = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(item) = items.get(index) else {
                            return done;
                        };
                        done.push((index, run(item)));
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|payload| std::panic::resume_unwind(payload))
            })
            .collect()
    });
    results.sort_by_key(|(index, _)| *index);
    results.into_iter().map(|(_, result)| result).collect()
}

/// Go: `TestEngineBoundaryLint`. eslint, run from `web/` on each case through its stdin,
/// rejects every engine or demo import of Vue or application code, every relative climb out of
/// either tree, every banned I/O global outside the production clock, transport and worker, and
/// every app import of engine internals, naming the rule; it accepts the allowed imports and
/// globals.
#[test]
fn engine_boundary_lint() {
    let Some(eslint) = eslint() else {
        return;
    };
    let problems: Vec<String> = parallel_map(CASES, |case| case_problem(&eslint, case))
        .into_iter()
        .flatten()
        .collect();
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}
