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

//! The shared version pins: every version written in more than one place is one value
//! everywhere it is written, so a bump in one file cannot leave another file building, linting or
//! testing with the old one.
//!
//! The pins: the Node line (the Node types, the shipped Dockerfile's web stage and every
//! node-version input of CI), the Rust release (`rust-toolchain.toml`, the Cargo `rust-version`,
//! the shipped Dockerfile's build image and `RUST_VERSION`, and `.mk/rust-release.mk`'s
//! `rust-std`), the zig, cargo-zigbuild and `rust-std` releases and archive digests the shipped
//! Dockerfile repeats from `.mk/rust-release.mk`, the one record of them, `ShellCheck` and Trivy.
//! The exact web pins and the node-version input rules (ported from the Go repository's
//! `test/toolchain/pins_test.go`) are BitGauge's own.
//!
//! Each pin is rust-common's `repo_meta::toolchain::one_value` over the files that write it. The
//! checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeMap;
use std::fs;
use std::sync::LazyLock;

use meta::SHIPPED_DOCKERFILE;
use regex::Regex;
use repo_meta::toolchain::{self, PinSource, PinValue};
use repo_meta::yaml::{self, ActionStep, Value};
use repo_meta::{Problem, pattern, report};

/// Reads a repository file by its slash-separated path, `None` when it cannot be read.
type Reader<'reader> = &'reader dyn Fn(&str) -> Option<String>;

/// The working tree as it is.
fn repo_file(file: &str) -> Option<String> {
    fs::read_to_string(meta::repo().path(file)).ok()
}

/// The working tree with the first `from` in `file` replaced by `to`. Panics when `file` does not
/// contain `from`, so a control cannot pass because its mutation missed.
fn mutated(file: &str, from: &str, to: &str) -> impl Fn(&str) -> Option<String> + use<> {
    let original = repo_file(file).unwrap_or_else(|| panic!("the control's {file} cannot be read"));
    assert!(original.contains(from), "{file} does not contain {from:?}");
    let changed = original.replacen(from, to, 1);
    let file = file.to_owned();
    move |name: &str| {
        if name == file {
            Some(changed.clone())
        } else {
            repo_file(name)
        }
    }
}

/// A required pin source in `file`, read through `read`; unreadable, it is a problem.
fn required(read: Reader<'_>, file: &str, text: &str) -> PinSource {
    PinSource {
        file: file.to_owned(),
        content: read(file),
        pattern: pattern(text),
        optional: false,
    }
}

/// A pin source that may be absent or write nothing.
fn optional(read: Reader<'_>, file: &str, text: &str) -> PinSource {
    required(read, file, text).optional()
}

/// The actions whose inputs carry a shared pin.
const SETUP_NODE: &str = "actions/setup-node";
/// Keys the node-version values of every step, setup-node's and others'.
const NODE_VERSION_INPUT: &str = "node-version";

static NODE_MAJOR: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\d+$"));

/// The pinned values by input, and a problem for every step that breaks a rule: any
/// node-version input, whatever the action or the reusable workflow that takes it, is a literal
/// Node major, and setup-node must have one.
fn action_pins(steps: &[ActionStep]) -> (BTreeMap<&'static str, Vec<PinValue>>, Vec<Problem>) {
    let mut values: BTreeMap<&'static str, Vec<PinValue>> = BTreeMap::new();
    let mut problems = Vec::new();
    for step in steps {
        let node_version = step.with.get(NODE_VERSION_INPUT);
        if node_version.is_some() || step.action == SETUP_NODE {
            let version = node_version.map_or("", String::as_str);
            if NODE_MAJOR.is_match(version) {
                values
                    .entry(NODE_VERSION_INPUT)
                    .or_default()
                    .push(PinValue::new(version, &step.file));
            } else {
                problems.push(Problem::at(
                    &step.file,
                    format!(
                        "{} must get node-version as a literal Node major, got {version:?}",
                        step.action
                    ),
                ));
            }
        }
    }
    (values, problems)
}

/// Every workflow and action under `.github`, parsed.
fn github_documents(read: Reader<'_>) -> Vec<(String, Value)> {
    meta::repo()
        .files_under(".github", &[".yaml", ".yml"])
        .into_iter()
        .map(|file| {
            let content = read(&file).unwrap_or_else(|| panic!("read {file}"));
            let document =
                yaml::parse(&file, &content).unwrap_or_else(|problem| panic!("{problem}"));
            (file, document)
        })
        .collect()
}

fn github_action_steps() -> Vec<ActionStep> {
    github_documents(&repo_file)
        .iter()
        .flat_map(|(file, document)| yaml::action_steps(file, document))
        .collect()
}

/// The Node line's sources: the shipped Dockerfile's web stage, the Node types, and an engines
/// field or a version file if one appears.
fn node_line_sources(read: Reader<'_>) -> Vec<PinSource> {
    vec![
        required(read, SHIPPED_DOCKERFILE, r"dhi\.io/node:(\d+)-"),
        required(
            read,
            "web/package.json",
            r#""@types/node":\s*"[\^~]?(\d+)\."#,
        ),
        optional(read, "web/package.json", r#""node":\s*"[\^~>=]*(\d+)"#),
        optional(read, ".nvmrc", r"^v?(\d+)"),
        optional(read, ".node-version", r"^v?(\d+)"),
    ]
}

const RUST_TOOLCHAIN: &str = "rust-toolchain.toml";
const RELEASE_MK: &str = ".mk/rust-release.mk";
const PRE_COMMIT_CONFIG: &str = ".pre-commit-config.yaml";
const SETUP_SHELLCHECK: &str = ".github/actions/setup-shellcheck/action.yaml";
const RELEASE_WORKFLOW: &str = ".github/workflows/release.yaml";
const SCHEDULED_SCAN: &str = ".github/workflows/scheduled-scan.yaml";

/// A `sha256` pin of an archive: the Dockerfile's case arm and `.mk/rust-release.mk`'s variable.
/// `arm` is the Dockerfile text that introduces the digest and `variable` the make variable.
fn archive_pin(read: Reader<'_>, what: &str, arm: &str, variable: &str) -> Vec<Problem> {
    toolchain::one_value(
        what,
        &[
            required(
                read,
                SHIPPED_DOCKERFILE,
                &format!(r"{}([0-9a-f]{{64}})\b", regex::escape(arm)),
            ),
            required(
                read,
                RELEASE_MK,
                &format!(
                    r"(?m)^{}\s*:?=\s*([0-9a-f]{{64}})\s*$",
                    regex::escape(variable)
                ),
            ),
        ],
        &[],
    )
}

/// The Rust release is one value: `rust-toolchain.toml`'s channel, the Cargo `rust-version`, the
/// shipped Dockerfile's `dhi.io/rust` build image and `RUST_VERSION`, and `.mk/rust-release.mk`'s
/// `rust-std`. A channel that is not an exact release (`stable`, `1.98`) differs from the rest.
fn rust_line_problems(read: Reader<'_>) -> Vec<Problem> {
    let content = |file: &str| read(file).unwrap_or_default();
    toolchain::one_value(
        "Rust release",
        &[
            PinSource::rust_channel(RUST_TOOLCHAIN, &content(RUST_TOOLCHAIN)),
            PinSource::rust_version("Cargo.toml", &content("Cargo.toml")),
            PinSource::rust_image_tag(SHIPPED_DOCKERFILE, &content(SHIPPED_DOCKERFILE)),
            PinSource::rust_version_arg(SHIPPED_DOCKERFILE, &content(SHIPPED_DOCKERFILE)),
            required(
                read,
                RELEASE_MK,
                r"(?m)^RUST_RELEASE_RUST_STD_VERSION\s*:?=\s*(\S+)\s*$",
            ),
        ],
        &[],
    )
}

/// The release toolchain the shipped Dockerfile repeats from `.mk/rust-release.mk`: the zig and
/// cargo-zigbuild releases, and each archive's digest.
fn release_pin_problems(read: Reader<'_>) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (what, dockerfile, variable) in [
        (
            "zig release",
            r"(?m)^ARG ZIG_VERSION=(\S+)\s*$",
            "RUST_RELEASE_ZIG_VERSION",
        ),
        (
            "cargo-zigbuild release",
            r"(?m)^ARG CARGO_ZIGBUILD_VERSION=(\S+)\s*$",
            "RUST_RELEASE_CARGO_ZIGBUILD_VERSION",
        ),
    ] {
        problems.extend(toolchain::one_value(
            what,
            &[
                required(read, SHIPPED_DOCKERFILE, dockerfile),
                required(
                    read,
                    RELEASE_MK,
                    &format!(r"(?m)^{variable}\s*:?=\s*(\S+)\s*$"),
                ),
            ],
            &[],
        ));
    }
    for arch in ["x86_64", "aarch64"] {
        problems.extend(archive_pin(
            read,
            &format!("zig {arch} digest"),
            &format!("zig_arch={arch}; zig_sha256="),
            &format!("RUST_RELEASE_ZIG_SHA256_{arch}"),
        ));
    }
    for asset in ["x86_64-unknown-linux-musl", "aarch64-unknown-linux-gnu"] {
        problems.extend(archive_pin(
            read,
            &format!("cargo-zigbuild {asset} digest"),
            &format!("zigbuild_asset={asset}; zigbuild_sha256="),
            &format!("RUST_RELEASE_CARGO_ZIGBUILD_SHA256_{asset}"),
        ));
    }
    for triple in ["x86_64-unknown-linux-musl", "aarch64-unknown-linux-musl"] {
        problems.extend(archive_pin(
            read,
            &format!("rust-std {triple} digest"),
            &format!("triple={triple}; std_sha256="),
            &format!("RUST_RELEASE_RUST_STD_SHA256_{triple}"),
        ));
    }
    problems
}

/// `ShellCheck` is one release: droast's bridge runs the shellcheck on PATH, which CI installs with
/// setup-shellcheck, and it must be the release the shellcheck-py hook wraps (its rev adds a
/// fourth component for the wrapper), which Dependabot moves.
fn shellcheck_problems(read: Reader<'_>) -> Vec<Problem> {
    toolchain::one_value(
        "ShellCheck release",
        &[
            required(
                read,
                PRE_COMMIT_CONFIG,
                r"shellcheck-py/shellcheck-py\s+rev:\s*v(\d+\.\d+\.\d+)(?:\.\d+)?\s",
            ),
            required(
                read,
                SETUP_SHELLCHECK,
                r"SHELLCHECK_VERSION:\s*v(\d+\.\d+\.\d+)\s",
            ),
        ],
        &[],
    )
}

/// Trivy is one release: the release workflow scans with the version the scheduled scan uses.
fn trivy_problems(read: Reader<'_>) -> Vec<Problem> {
    toolchain::one_value(
        "Trivy release",
        &[
            required(
                read,
                RELEASE_WORKFLOW,
                r"(?m)^\s*TRIVY_VERSION:\s*(v\S+)\s*$",
            ),
            required(read, SCHEDULED_SCAN, r"(?m)^\s*TRIVY_VERSION:\s*(v\S+)\s*$"),
        ],
        &[],
    )
}

/// The tools other files must match, pinned exactly in `web/package.json`.
const EXACT_WEB_TOOLS: [&str; 2] = ["@playwright/test", "fallow"];

fn exact_web_pin_problems(manifest: &str) -> Vec<String> {
    let parsed: Value = serde_json::from_str(manifest)
        .unwrap_or_else(|error| panic!("parse web/package.json: {error}"));
    let exact = pattern(r"^\d+\.\d+\.\d+$");
    EXACT_WEB_TOOLS
        .into_iter()
        .filter_map(|name| {
            let version = parsed
                .get("devDependencies")
                .and_then(|dependencies| dependencies.get(name))
                .and_then(Value::as_str);
            match version {
                Some(version) if exact.is_match(version) => None,
                _ => Some(format!(
                    "web/package.json pins {name} as {version:?}; want an exact version"
                )),
            }
        })
        .collect()
}

fn assert_none(problems: &[Problem]) {
    assert!(problems.is_empty(), "{}", report(problems));
}

fn assert_some(problems: &[Problem], what: &str) {
    assert!(!problems.is_empty(), "the control {what} found nothing");
}

/// Go: `TestActionStepsArePinned`: no setup-node step, nor any other step with a node-version
/// input, under `.github` leaves the Node line to the action's default, a range or a file the
/// other pins do not see.
#[test]
fn action_steps_are_pinned() {
    let (_, problems) = action_pins(&github_action_steps());
    assert_none(&problems);
}

/// Go: `TestNodeLineIsOneValue`: the Node major is one value everywhere it is written: the web
/// stage of the shipped Dockerfile, the Node types, an engines field or a version file if one
/// appears, and every node-version input.
#[test]
fn node_line_is_one_value() {
    let (steps, _) = action_pins(&github_action_steps());
    let extra = steps.get(NODE_VERSION_INPUT).cloned().unwrap_or_default();
    assert_none(&toolchain::one_value(
        "Node line",
        &node_line_sources(&repo_file),
        &extra,
    ));
}

/// The Node line control: another major in the Node types, in the shipped Dockerfile's web
/// stage or in a CI step fails.
#[test]
fn node_line_control_fails_on_another_major() {
    let (steps, _) = action_pins(&github_action_steps());
    let extra = steps.get(NODE_VERSION_INPUT).cloned().unwrap_or_default();
    let types = mutated(
        "web/package.json",
        r#""@types/node": "^24."#,
        r#""@types/node": "^22."#,
    );
    assert_some(
        &toolchain::one_value("Node line", &node_line_sources(&types), &extra),
        "of the Node types",
    );
    let image = mutated(SHIPPED_DOCKERFILE, "dhi.io/node:24-", "dhi.io/node:22-");
    assert_some(
        &toolchain::one_value("Node line", &node_line_sources(&image), &extra),
        "of the web stage",
    );
    let mut step = extra;
    step.push(PinValue::new("22", ".github/workflows/sample.yaml"));
    assert_some(
        &toolchain::one_value("Node line", &node_line_sources(&repo_file), &step),
        "of a CI step",
    );
}

/// Go: `TestExactWebPins`: the tools whose version other files must match are pinned exactly in
/// `web/package.json`, without a range.
#[test]
fn exact_web_pins() {
    let manifest = meta::repo().read("web/package.json");
    let problems = exact_web_pin_problems(&manifest);
    assert!(problems.is_empty(), "{}", problems.join("\n"));
    let ranged = manifest.replacen(r#""fallow": ""#, r#""fallow": "^"#, 1);
    assert!(
        !exact_web_pin_problems(&ranged).is_empty(),
        "the control of a ranged fallow found nothing"
    );
}

fn parsed_steps(file: &str, content: &str) -> Vec<ActionStep> {
    let document = yaml::parse(file, content).unwrap_or_else(|problem| panic!("{problem}"));
    yaml::action_steps(file, &document)
}

/// Go: `TestActionPinRules`: the negative control of the action rules: a pinned step gives its
/// value, each unpinned form is a problem, and a reusable workflow's node-version input is the
/// Node line too. The Go cases (setup-go and golangci-lint-action) left with the Go toolchain.
#[test]
fn action_pin_rules() {
    let steps = parsed_steps(
        "sample.yaml",
        r#"jobs:
  lint:
    steps:
      - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567 # v7.1.0
        with:
          node-version: "24"
"#,
    );
    let (values, problems) = action_pins(&steps);
    assert_none(&problems);
    assert_eq!(
        values.get(NODE_VERSION_INPUT),
        Some(&vec![PinValue::new("24", "sample.yaml")])
    );

    let steps = parsed_steps(
        "action.yml",
        r#"runs:
  using: composite
  steps:
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
      with:
        node-version: lts/*
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
      with:
        node-version-file: .nvmrc
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
    - uses: some/other-action@0123456789abcdef0123456789abcdef01234567
      with:
        node-version: "22.1"
"#,
    );
    let (values, problems) = action_pins(&steps);
    assert!(
        problems.len() == 4 && values.is_empty(),
        "unpinned steps: want 4 problems and no values, got {values:?} and {problems:?}"
    );

    let steps = parsed_steps(
        "ci.yaml",
        r"jobs:
  web:
    uses: ./.github/workflows/web.yaml
    with:
      node-version: '22'
  build:
    uses: ./.github/workflows/build.yaml
    with:
      node-version: lts/*
",
    );
    let (values, problems) = action_pins(&steps);
    assert_eq!(
        values.get(NODE_VERSION_INPUT),
        Some(&vec![PinValue::new("22", "ci.yaml")])
    );
    assert_eq!(problems.len(), 1, "reusable workflow inputs: {problems:?}");
}

/// The Rust release is one exact release in every file that writes it. The image's `debian13-dev`
/// variant is held by the image's own build.
#[test]
fn rust_line_is_one_value() {
    assert_none(&rust_line_problems(&repo_file));
}

/// The Rust line control: another release in any one source, or a channel that is not a release,
/// fails.
#[test]
fn rust_line_control_fails_on_another_release() {
    let line = pattern(r#"(?m)^channel\s*=\s*"([^"]+)""#)
        .captures(&meta::repo().read(RUST_TOOLCHAIN))
        .map_or_else(
            || panic!("rust-toolchain.toml names no channel"),
            |captures| captures[1].to_owned(),
        );
    let dockerfile = SHIPPED_DOCKERFILE;
    let cases = [
        (RUST_TOOLCHAIN, format!(r#"channel = "{line}""#)),
        ("Cargo.toml", format!(r#"rust-version = "{line}""#)),
        (dockerfile, format!("dhi.io/rust:{line}-")),
        (dockerfile, format!("ARG RUST_VERSION={line}")),
        (
            RELEASE_MK,
            format!("RUST_RELEASE_RUST_STD_VERSION := {line}"),
        ),
    ];
    for (file, text) in cases {
        let read = mutated(file, &text, &text.replace(&line, "1.0.0"));
        assert_some(&rust_line_problems(&read), &text);
    }
    let channel = mutated(
        RUST_TOOLCHAIN,
        &format!(r#"channel = "{line}""#),
        r#"channel = "stable""#,
    );
    assert_some(&rust_line_problems(&channel), "of a stable channel");
}

/// The zig, cargo-zigbuild and `rust-std` releases and every archive digest the shipped Dockerfile
/// checks are `.mk/rust-release.mk`'s, which calls itself the one record of those pins.
#[test]
fn rust_release_pins_match_the_makefile() {
    assert_none(&release_pin_problems(&repo_file));
}

static SHA256: LazyLock<Regex> = LazyLock::new(|| pattern(r"\b[0-9a-f]{64}\b"));

/// The release pin control: another zig or cargo-zigbuild release, or a changed digest in either
/// file, fails.
#[test]
fn rust_release_pin_control_fails_on_a_change() {
    let dockerfile = SHIPPED_DOCKERFILE;
    let docker = meta::repo().read(dockerfile);
    let hash = SHA256
        .find_iter(&docker)
        .find(|found| !docker[..found.start()].ends_with("@sha256:"))
        .map_or_else(
            || panic!("{dockerfile} checks no archive"),
            |found| found.as_str().to_owned(),
        );
    let changed = format!("{}0", &hash[..63]);
    let cases = [
        mutated(dockerfile, "ARG ZIG_VERSION=", "ARG ZIG_VERSION=9"),
        mutated(
            RELEASE_MK,
            "RUST_RELEASE_CARGO_ZIGBUILD_VERSION := ",
            "RUST_RELEASE_CARGO_ZIGBUILD_VERSION := 9",
        ),
        mutated(dockerfile, &hash, &changed),
        mutated(RELEASE_MK, &hash, &changed),
    ];
    for (index, read) in cases.iter().enumerate() {
        assert_some(&release_pin_problems(read), &format!("case {index}"));
    }
}

/// Go: `TestShellCheckIsOneVersion`.
#[test]
fn shell_check_is_one_version() {
    assert_none(&shellcheck_problems(&repo_file));
}

/// The `ShellCheck` control: another release in setup-shellcheck, or in the hook, fails.
#[test]
fn shell_check_control_fails_on_another_version() {
    let action = mutated(
        SETUP_SHELLCHECK,
        "SHELLCHECK_VERSION: v",
        "SHELLCHECK_VERSION: v9",
    );
    assert_some(&shellcheck_problems(&action), "of setup-shellcheck");
    let hook = mutated(
        PRE_COMMIT_CONFIG,
        "shellcheck-py/shellcheck-py\n    rev: v",
        "shellcheck-py/shellcheck-py\n    rev: v9",
    );
    assert_some(&shellcheck_problems(&hook), "of the shellcheck-py hook");
}

/// The release workflow and the scheduled scan install the same Trivy.
#[test]
fn trivy_is_one_version() {
    assert_none(&trivy_problems(&repo_file));
}

/// The Trivy control: another release in either workflow fails.
#[test]
fn trivy_control_fails_on_another_version() {
    for file in [RELEASE_WORKFLOW, SCHEDULED_SCAN] {
        let changed = mutated(file, "TRIVY_VERSION: v", "TRIVY_VERSION: v9");
        assert_some(&trivy_problems(&changed), file);
    }
}
