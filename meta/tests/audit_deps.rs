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

//! What `make audit-deps` runs (`.mk/audit-deps.mk`), and that each scanner is fetched at a fixed
//! version, so two runs of the same commit mean the same thing. Before the cutover it is the
//! pinned govulncheck over the Go module and npm audit over the web lockfile; the Rust graph is
//! checked by `make rust-deny` (`.mk/rust.mk`), which audit-deps does not run yet. After the
//! cutover the Go scan is gone and audit-deps runs the web audit and `rust-deny`. What is expected
//! follows [`TRANSITION`](meta::transition::TRANSITION).
//!
//! The checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeSet;

use meta::repo;
use meta::transition::{TRANSITION, Transition};
use regex::Regex;

const AUDIT_MK: &str = ".mk/audit-deps.mk";
const RUST_MK: &str = ".mk/rust.mk";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The prerequisites `make audit-deps` runs at each stage.
fn expected_audits(transition: Transition) -> BTreeSet<&'static str> {
    match transition {
        Transition::Candidate => BTreeSet::from(["audit-deps-go", "audit-deps-web"]),
        Transition::Done => BTreeSet::from(["audit-deps-web", "rust-deny"]),
    }
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

/// The problems with govulncheck's pin: before the cutover it is an exact version; after it, the
/// Go scan and its pin are gone. Nothing is ever fetched `@latest`.
fn govulncheck_problems(transition: Transition, fragment: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let pinned = pattern(r"(?m)^GOVULNCHECK_VERSION \?= v\d+\.\d+\.\d+$").is_match(fragment);
    match transition {
        Transition::Candidate => {
            if !pinned {
                problems.push(format!(
                    "{AUDIT_MK} does not pin GOVULNCHECK_VERSION to an exact version"
                ));
            }
        }
        Transition::Done => {
            if fragment.contains("GOVULNCHECK") || fragment.contains("audit-deps-go") {
                problems.push(format!(
                    "{AUDIT_MK} still runs govulncheck after the cutover"
                ));
            }
        }
    }
    if fragment.contains("@latest") {
        problems.push(format!("{AUDIT_MK} fetches something @latest"));
    }
    problems
}

/// The problems with what `make audit-deps` runs: exactly the stage's audits, each a target the
/// audit or Rust fragment defines, with `rust-deny` checking the whole workspace.
fn audit_target_problems(transition: Transition, audit: &str, rust: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let Some(runs) = prerequisites(audit, "audit-deps") else {
        return vec![format!("{AUDIT_MK} defines no audit-deps target")];
    };
    let expected = expected_audits(transition);
    if runs != expected {
        problems.push(format!(
            "make audit-deps runs {runs:?}; at {transition:?} it runs {expected:?}"
        ));
    }
    for target in runs {
        if prerequisites(audit, target).is_none() && prerequisites(rust, target).is_none() {
            problems.push(format!(
                "audit-deps runs {target}, which neither {AUDIT_MK} nor {RUST_MK} defines"
            ));
        }
    }
    // The root is a package as well as the workspace: without --workspace, cargo deny checks the
    // server's graph only.
    if !recipe(rust, "rust-deny")
        .iter()
        .any(|line| pattern(r"\bdeny\s+--workspace\s+check\b").is_match(line))
    {
        problems.push(format!(
            "{RUST_MK}'s rust-deny does not run cargo deny --workspace check"
        ));
    }
    problems
}

fn assert_none(problems: &[String]) {
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestAuditGovulncheckIsPinned`: the scanner is fetched at a fixed version, and nothing
/// `@latest`. An unpinned `go run @latest` would make two runs of the same commit mean different
/// things. After the cutover, the Go scan is gone.
#[test]
fn audit_govulncheck_is_pinned() {
    assert_none(&govulncheck_problems(TRANSITION, &repo::read(AUDIT_MK)));
}

/// The govulncheck control: a range, `latest`, a missing pin or an `@latest` fetch fails.
#[test]
fn govulncheck_control_fails_on_an_unpinned_scanner() {
    let fragment = repo::read(AUDIT_MK);
    let version = pattern(r"(?m)^GOVULNCHECK_VERSION \?= (\S+)$")
        .captures(&fragment)
        .map(|captures| captures[0].to_owned());
    let cases: Vec<String> = match (TRANSITION, version) {
        (Transition::Candidate, Some(line)) => vec![
            fragment.replacen(&line, "GOVULNCHECK_VERSION ?= latest", 1),
            fragment.replacen(&line, "GOVULNCHECK_VERSION ?= v1.8", 1),
            fragment.replacen(&line, "", 1),
            fragment.replacen("@$(GOVULNCHECK_VERSION)", "@latest", 1),
        ],
        (Transition::Candidate, None) => panic!("{AUDIT_MK} pins no GOVULNCHECK_VERSION"),
        (Transition::Done, _) => vec![
            format!("{fragment}\nGOVULNCHECK_VERSION ?= v1.8.0\n"),
            format!("{fragment}\nTOOL ?= example.org/tool@latest\n"),
        ],
    };
    for case in cases {
        assert!(
            !govulncheck_problems(TRANSITION, &case).is_empty(),
            "the control passed:\n{case}"
        );
    }
}

/// `make audit-deps` runs exactly the stage's audits: before the cutover the Go and web scans
/// only, so the Rust graph is checked by `make rust-deny` and not by audit-deps; after it, the web
/// scan and `rust-deny`. `rust-deny` checks the whole workspace either way.
#[test]
fn audit_deps_runs_the_stage_audits() {
    assert_none(&audit_target_problems(
        TRANSITION,
        &repo::read(AUDIT_MK),
        &repo::read(RUST_MK),
    ));
}

/// The audit target control: an audit added or dropped, an undefined one, or a `rust-deny` that
/// checks one package only fails.
#[test]
fn audit_deps_control_fails_on_another_set() {
    let audit = repo::read(AUDIT_MK);
    let rust = repo::read(RUST_MK);
    let rule = pattern(r"(?m)^audit-deps:[^#\n]*")
        .find(&audit)
        .map_or_else(
            || panic!("{AUDIT_MK} defines no audit-deps target"),
            |found| found.as_str().to_owned(),
        );
    let expected: Vec<&str> = expected_audits(TRANSITION).into_iter().collect();
    let cases = [
        (
            audit.replacen(
                &rule,
                &format!("audit-deps: {}", expected[1..].join(" ")),
                1,
            ),
            rust.clone(),
        ),
        (
            audit.replacen(&rule, &format!("{rule} audit-deps-extra"), 1),
            rust.clone(),
        ),
        (
            audit.clone(),
            rust.replacen("deny --workspace check", "deny check", 1),
        ),
    ];
    for (audit_case, rust_case) in cases {
        assert!(
            !audit_target_problems(TRANSITION, &audit_case, &rust_case).is_empty(),
            "the control passed:\n{audit_case}\n{rust_case}"
        );
    }
}
