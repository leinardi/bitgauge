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

//! No gate may pass on nothing (AGENTS.md): the files that define gates (the Makefile, the make
//! fragments, the web scripts, the pre-commit configuration and every YAML file under `.github`)
//! carry none of the flags that turn a gate with nothing to check, or a failing one, into a pass,
//! and every clippy run denies warnings. The check is rust-common's
//! `repo_meta::vacuous::VacuousFlags` with the core and Rust sets; this repository needs no
//! exception. The two JavaScript flags (a test runner or a linter that passes on no files) are
//! BitGauge's own, read from `web/package.json`. Each flag is also run on a sample written as a
//! gate would carry it.

use std::fs;

use repo_meta::report;
use repo_meta::vacuous::{AllowedFragment, Flag, VacuousFlags};

/// The reviewed exceptions: none.
const ALLOWED: &[AllowedFragment<'static>] = &[];

/// The flags that turn a web gate with nothing to check into a pass.
fn javascript_flags() -> Vec<Flag> {
    [
        ("--passWithNoTests", r"--passWithNoTests\b"),
        (
            "--no-error-on-unmatched-pattern",
            r"--no-error-on-unmatched-pattern\b",
        ),
    ]
    .into_iter()
    .map(|(name, text)| Flag {
        name,
        pattern: repo_meta::pattern(text),
    })
    .collect()
}

/// The names of the JavaScript flags on `manifest`'s lines.
fn javascript_hits(manifest: &str) -> Vec<&'static str> {
    javascript_flags()
        .into_iter()
        .filter(|flag| manifest.lines().any(|line| flag.pattern.is_match(line)))
        .map(|flag| flag.name)
        .collect()
}

fn flags() -> VacuousFlags {
    VacuousFlags::core().with_rust()
}

/// The flags found in `sample`, read as a line of the Makefile.
fn sample_problems(sample: &str) -> usize {
    flags()
        .problems(&[("Makefile".to_owned(), sample.to_owned())], ALLOWED)
        .len()
}

/// The regular files directly in `directory` (relative to the root) whose names end with one of
/// `suffixes`, as paths relative to the root, sorted; a missing directory lists nothing.
fn glob(directory: &str, suffixes: &[&str]) -> Vec<String> {
    let entries = match fs::read_dir(meta::repo().path(directory)) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => panic!("list {directory}: {error}"),
    };
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.unwrap_or_else(|error| panic!("list {directory}: {error}"));
        let kind = entry
            .file_type()
            .unwrap_or_else(|error| panic!("inspect {directory}: {error}"));
        if !kind.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        for suffix in suffixes {
            if name.ends_with(suffix) {
                files.push(format!("{directory}/{name}"));
            }
        }
    }
    files.sort();
    files
}

/// Go: `TestNoVacuousFlags`. The Makefile, `web/package.json`, `.pre-commit-config.yaml`, every
/// `.mk` fragment directly under `.mk/` and every YAML file under `.github` carry no vacuous
/// flag; finding no make fragment or no workflow at all fails, since the scan would then check
/// nothing.
#[test]
fn no_vacuous_flags() {
    let repo = meta::repo();
    let fragments = glob(".mk", &[".mk"]);
    assert!(
        !fragments.is_empty(),
        "no make fragments found under .mk/; the scan would check nothing"
    );
    let github = repo.files_under(".github", &[".yaml", ".yml"]);
    assert!(
        !github.is_empty(),
        "no YAML found under .github; the scan would check nothing"
    );
    let mut files: Vec<String> = ["Makefile", "web/package.json", ".pre-commit-config.yaml"]
        .map(str::to_owned)
        .into();
    files.extend(fragments);
    files.extend(github);
    let problems = flags().problems(&repo.read_all(&files), ALLOWED);
    assert!(problems.is_empty(), "{}", report(&problems));
    let hits = javascript_hits(&repo.read("web/package.json"));
    assert!(hits.is_empty(), "web/package.json carries {hits:?}");
}

/// Go: `TestVacuousFlagsAreRecognized`. Negative control: each flag, written as a gate would
/// carry it, is found.
#[test]
fn vacuous_flags_are_recognized() {
    let missed: Vec<&str> = [
        "\tnpm --prefix web run lint || true",
        "\tgo vet ./... ||:",
        "\tgo vet ./... || exit 0",
        "\t-npm --prefix web run lint",
        "\t@-go vet ./...",
        ".IGNORE: web-lint",
        "\t$(MAKE) -i go-test",
        "\t$(MAKE) --ignore-errors go-test",
        "        continue-on-error: true",
        "    if: false",
        "    if: ${{ false }}",
        "    if: 'false'",
        "    if: \"${{ false }}\"",
        "\tcargo test --workspace --locked --no-run",
        "        run: cargo clippy --workspace -- --cap-lints warn",
        "\tcargo clippy --workspace -- -A warnings",
        "        entry: cargo test --workspace --locked -- --skip slow",
        "\tcargo test --workspace --exclude meta --locked",
        "        run: cargo clippy --workspace --all-targets --locked",
    ]
    .into_iter()
    .filter(|sample| sample_problems(sample) == 0)
    .collect();
    assert!(missed.is_empty(), "no vacuous flag found in {missed:?}");
    assert_eq!(
        javascript_hits(r#""test": "vitest run --passWithNoTests""#),
        ["--passWithNoTests"]
    );
    assert_eq!(
        javascript_hits(r#""lint": "eslint src --no-error-on-unmatched-pattern""#),
        ["--no-error-on-unmatched-pattern"]
    );
    assert_eq!(
        sample_problems("\t$(CARGO) clippy --workspace --all-targets --locked -- -D warnings"),
        0,
        "a clippy run that denies warnings is not a vacuous flag"
    );
}
