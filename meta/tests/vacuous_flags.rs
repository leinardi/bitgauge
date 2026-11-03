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
//! carry none of the flags that turn a gate with nothing to check, or a failing one, into a pass.
//! Each flag pattern is also run on a sample written as a gate would carry it.

use std::fs;
use std::sync::LazyLock;

use meta::repo;
use regex::Regex;

/// A pattern written in Go's RE2 syntax, compiled to mean the same in Rust: RE2's `\s`, `\b` and
/// `\d` are ASCII-only, where Rust's are Unicode-aware, and Rust's ASCII `\s` adds `\v`.
fn re2(pattern: &str) -> Regex {
    let translated = pattern
        .replace(r"\s", r"[\t\n\f\r ]")
        .replace(r"\b", r"(?-u:\b)")
        .replace(r"\d", "[0-9]");
    Regex::new(&translated).unwrap_or_else(|error| panic!("pattern {pattern}: {error}"))
}

/// The flags that turn a gate with nothing to check, or a failing one, into a pass, each with the
/// name a finding reports.
static VACUOUS_FLAGS: LazyLock<Vec<(&str, Regex)>> = LazyLock::new(|| {
    [
        ("--passWithNoTests", r"--pass-?[Ww]ith-?[Nn]o-?[Tt]ests"),
        (
            "--no-error-on-unmatched-pattern",
            r"--no-error-on-unmatched-pattern",
        ),
        ("|| true", r"\|\|\s*(true\b|:(\s|;|$)|exit\s+0\b)"),
        ("make's - recipe prefix", r"^\t[@+]*-"),
        (".IGNORE", r"^\.IGNORE\b"),
        (
            "make --ignore-errors",
            r"\$\(MAKE\).*\s(-[a-zA-Z]*i[a-zA-Z]*|--ignore-errors)\b",
        ),
        ("continue-on-error", r"continue-on-error"),
        (
            "if: false",
            r#"\bif:\s*(["']?false["']?\s*$|["']?\$\{\{\s*false\s*\}\}["']?)"#,
        ),
    ]
    .into_iter()
    .map(|(name, pattern)| (name, re2(pattern)))
    .collect()
});

/// Every vacuous flag in `content`, as `line: flag: text`.
fn vacuous_hits(content: &str) -> Vec<String> {
    let mut hits = Vec::new();
    for (index, line) in content.split('\n').enumerate() {
        for (name, pattern) in VACUOUS_FLAGS.iter() {
            if pattern.is_match(line) {
                hits.push(format!("{}: {name}: {}", index + 1, line.trim()));
            }
        }
    }
    hits
}

/// The regular files directly in `directory` (relative to the root) whose names end with one of
/// `suffixes`, as paths relative to the root, sorted; a missing directory lists nothing.
fn glob(directory: &str, suffixes: &[&str]) -> Vec<String> {
    let entries = match fs::read_dir(repo::path(directory)) {
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

/// Every non-directory under `.github` named `*.yaml` or `*.yml`, as paths relative to the root,
/// in walk order; a missing `.github` lists nothing.
fn github_yaml() -> Vec<String> {
    let mut files = Vec::new();
    if !repo::path(".github").is_dir() {
        return files;
    }
    walk(".github", &mut files);
    files
}

fn walk(directory: &str, files: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(repo::path(directory))
        .unwrap_or_else(|error| panic!("list {directory}: {error}"))
        .map(|entry| entry.unwrap_or_else(|error| panic!("list {directory}: {error}")))
        .collect();
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let relative = format!("{directory}/{name}");
        let kind = entry
            .file_type()
            .unwrap_or_else(|error| panic!("inspect {relative}: {error}"));
        if kind.is_dir() {
            walk(&relative, files);
        } else if [".yaml", ".yml"]
            .iter()
            .any(|suffix| name.ends_with(suffix))
        {
            files.push(relative);
        }
    }
}

/// Go: `TestNoVacuousFlags`. The Makefile, `web/package.json`, `.pre-commit-config.yaml`, every
/// `.mk` fragment directly under `.mk/` and every YAML file under `.github` carry no vacuous
/// flag; finding no make fragment at all fails, since the scan would then check nothing.
#[test]
fn no_vacuous_flags() {
    let fragments = glob(".mk", &[".mk"]);
    assert!(
        !fragments.is_empty(),
        "no make fragments found under .mk/; the scan would check nothing"
    );
    let mut files: Vec<String> = ["Makefile", "web/package.json", ".pre-commit-config.yaml"]
        .map(str::to_owned)
        .into();
    files.extend(fragments);
    files.extend(github_yaml());
    let problems: Vec<String> = files
        .iter()
        .flat_map(|relative| {
            vacuous_hits(&repo::read(relative))
                .into_iter()
                .map(move |hit| format!("{relative}:{hit}"))
        })
        .collect();
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestVacuousFlagsAreRecognized`. Negative control: each flag, written as a gate would
/// carry it, is found.
#[test]
fn vacuous_flags_are_recognized() {
    let missed: Vec<&str> = [
        r#""test": "vitest run --passWithNoTests""#,
        r#""lint": "eslint src --no-error-on-unmatched-pattern""#,
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
    ]
    .into_iter()
    .filter(|sample| vacuous_hits(sample).is_empty())
    .collect();
    assert!(missed.is_empty(), "no vacuous flag found in {missed:?}");
}
