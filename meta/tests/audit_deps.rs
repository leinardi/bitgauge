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

//! What `make audit-deps` runs (`.mk/audit-deps.mk`): npm audit over the web lockfile and
//! `make rust-deny` (`.mk/rust.mk`) over the whole Rust workspace, and nothing fetched `@latest`,
//! so two runs of the same commit mean the same thing. The cargo-deny release is pinned by
//! `.github/actions/setup-cargo-deny`.
//!
//! The checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeSet;

use regex::Regex;

const AUDIT_MK: &str = ".mk/audit-deps.mk";
const RUST_MK: &str = ".mk/rust.mk";
const MAKEFILE: &str = "Makefile";

/// The prerequisites `make audit-deps` runs.
const EXPECTED_AUDITS: [&str; 2] = ["audit-deps-web", "rust-deny"];

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The prerequisites of `target` in a makefile fragment, `None` when the fragment does not define
/// it.
fn prerequisites<'text>(fragment: &'text str, target: &str) -> Option<BTreeSet<&'text str>> {
    pattern(&format!(r"(?m)^{}:([^#\n]*)", regex::escape(target)))
        .captures(fragment)
        .and_then(|captures| captures.get(1))
        .map(|found| found.as_str().split_whitespace().collect())
}

/// The recipe lines of `target`: the tab-indented lines after its rule.
fn recipe<'text>(fragment: &'text str, target: &str) -> Vec<&'text str> {
    let rule = format!("{target}:");
    fragment
        .lines()
        .skip_while(|line| !line.starts_with(&rule))
        .skip(1)
        .take_while(|line| line.starts_with('\t'))
        .collect()
}

/// The problems with how the audit fragment fetches its scanners: nothing `@latest`.
fn fetch_problems(fragment: &str) -> Vec<String> {
    if fragment.contains("@latest") {
        vec![format!("{AUDIT_MK} fetches something @latest")]
    } else {
        Vec::new()
    }
}

/// The problems with what `make audit-deps` runs: exactly [`EXPECTED_AUDITS`], each a target the
/// audit or Rust fragment defines, with `rust-deny` checking the whole workspace.
fn audit_target_problems(audit: &str, rust: &str, makefile: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let Some(runs) = prerequisites(audit, "audit-deps") else {
        return vec![format!("{AUDIT_MK} defines no audit-deps target")];
    };
    let expected = BTreeSet::from(EXPECTED_AUDITS);
    if runs != expected {
        problems.push(format!("make audit-deps runs {runs:?}, want {expected:?}"));
    }
    for target in runs {
        if prerequisites(audit, target).is_none() && prerequisites(rust, target).is_none() {
            problems.push(format!(
                "audit-deps runs {target}, which neither {AUDIT_MK} nor {RUST_MK} defines"
            ));
        }
    }
    // The root is a package as well as the workspace: without --workspace, cargo deny checks the
    // server's graph only. make-common's rust-deny takes its scope from RUST_DENY_ARGS, whose
    // default is --workspace; the Makefile must leave it alone.
    let deny_lines = recipe(rust, "rust-deny");
    let literal_scope = deny_lines
        .iter()
        .any(|line| pattern(r"\bdeny\s+--workspace\s+check\b").is_match(line));
    let variable_scope = deny_lines
        .iter()
        .any(|line| pattern(r"\bdeny\s+\$\(RUST_DENY_ARGS\)\s+check\b").is_match(line))
        && pattern(r"(?m)^RUST_DENY_ARGS\s*\?=\s*--workspace\s*$").is_match(rust)
        && !pattern(r"(?m)^RUST_DENY_ARGS\s*:?=").is_match(makefile);
    if !(literal_scope || variable_scope) {
        problems.push(format!(
            "{RUST_MK}'s rust-deny does not run cargo deny --workspace check"
        ));
    }
    problems
}

fn assert_none(problems: &[String]) {
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestAuditGovulncheckIsPinned`, without the Go scanner it pinned: nothing the audit runs
/// is fetched `@latest`, which would make two runs of the same commit mean different things.
#[test]
fn audit_fetches_nothing_at_latest() {
    assert_none(&fetch_problems(&meta::repo().read(AUDIT_MK)));
}

/// The fetch control: an `@latest` fetch fails.
#[test]
fn fetch_control_fails_on_latest() {
    let fragment = format!(
        "{}\nTOOL ?= example.org/tool@latest\n",
        meta::repo().read(AUDIT_MK)
    );
    assert!(
        !fetch_problems(&fragment).is_empty(),
        "the control passed:\n{fragment}"
    );
}

/// `make audit-deps` runs exactly the web scan and `rust-deny`, which checks the whole workspace.
#[test]
fn audit_deps_runs_the_expected_audits() {
    assert_none(&audit_target_problems(
        &meta::repo().read(AUDIT_MK),
        &meta::repo().read(RUST_MK),
        &meta::repo().read(MAKEFILE),
    ));
}

/// The audit target control: an audit added or dropped, an undefined one, or a `rust-deny` that
/// checks one package only (no scope, an empty default, or the Makefile clearing it) fails.
#[test]
fn audit_deps_control_fails_on_another_set() {
    let audit = meta::repo().read(AUDIT_MK);
    let rust = meta::repo().read(RUST_MK);
    let makefile = meta::repo().read(MAKEFILE);
    let rule = pattern(r"(?m)^audit-deps:[^#\n]*")
        .find(&audit)
        .map_or_else(
            || panic!("{AUDIT_MK} defines no audit-deps target"),
            |found| found.as_str().to_owned(),
        );
    let cases = [
        (
            audit.replacen(&rule, &format!("audit-deps: {}", EXPECTED_AUDITS[1]), 1),
            rust.clone(),
            makefile.clone(),
        ),
        (
            audit.replacen(&rule, &format!("{rule} audit-deps-extra"), 1),
            rust.clone(),
            makefile.clone(),
        ),
        (
            audit.clone(),
            rust.replacen("deny $(RUST_DENY_ARGS) check", "deny check", 1),
            makefile.clone(),
        ),
        (
            audit.clone(),
            rust.replacen("RUST_DENY_ARGS ?= --workspace", "RUST_DENY_ARGS ?=", 1),
            makefile.clone(),
        ),
        (
            audit.clone(),
            rust.clone(),
            format!("{makefile}\nRUST_DENY_ARGS :=\n"),
        ),
    ];
    for (audit_case, rust_case, makefile_case) in cases {
        assert!(
            !audit_target_problems(&audit_case, &rust_case, &makefile_case).is_empty(),
            "the control passed:\n{audit_case}\n{rust_case}\n{makefile_case}"
        );
    }
}
