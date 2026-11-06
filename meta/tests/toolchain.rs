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
//! everywhere it is written, and every CI step that installs a pinned tool names it exactly, so
//! a bump in one file cannot leave another file building, linting or testing with the old one.
//!
//! The pins: the Node line, `ShellCheck`, the exact web pins and the action-step rules (ported
//! from the Go repository's `test/toolchain/pins_test.go`), the Rust release (`rust-toolchain.toml`,
//! the Cargo `rust-version`, the shipped Dockerfile's build image and `RUST_VERSION`,
//! `.mk/rust-release.mk`'s `rust-std` and every CI step that names a Rust toolchain), and the
//! release toolchain pins the shipped Dockerfile repeats from `.mk/rust-release.mk`, the one
//! record of them.
//!
//! The generic rules are rust-common's `repo_meta::toolchain` (`one_value`, the Rust release
//! held exactly, CI toolchains read from the input or a non-commit `@` reference, the release
//! pins with their exact per-platform arms, `ShellCheck`) with this repository's files; the Node
//! input rules and the exact web pins are BitGauge's own. The checks are functions of the text,
//! and each is also run on input built to break it.

use std::collections::BTreeMap;
use std::fs;
use std::sync::LazyLock;

use meta::SHIPPED_DOCKERFILE;
use regex::Regex;
use repo_meta::toolchain::{
    self, PinSource, PinValue, RUST_RELEASE_PINS, RustVersion, ToolchainRef,
};
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

/// The pre-commit configuration and the action that installs `ShellCheck` in CI.
const PRE_COMMIT_CONFIG: &str = ".pre-commit-config.yaml";
const SETUP_SHELLCHECK: &str = ".github/actions/setup-shellcheck/action.yaml";

fn shellcheck_problems(read: Reader<'_>) -> Vec<Problem> {
    toolchain::shellcheck_problems(
        PRE_COMMIT_CONFIG,
        &read(PRE_COMMIT_CONFIG).unwrap_or_default(),
        SETUP_SHELLCHECK,
        &read(SETUP_SHELLCHECK).unwrap_or_default(),
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

const RUST_TOOLCHAIN: &str = "rust-toolchain.toml";
const RELEASE_MK: &str = ".mk/rust-release.mk";

/// The Rust release's problems: `rust-toolchain.toml` pins an exact release, and the Cargo
/// `rust-version`, the shipped Dockerfile's `dhi.io/rust` tag and `RUST_VERSION`, the `rust-std`
/// release `.mk/rust-release.mk` pins and every toolchain CI names (an action's input or its
/// non-commit `@` reference, a `RUSTUP_TOOLCHAIN`, a `rustup` or `cargo +` command) are exactly
/// it; a toolchain action that names none must read `rust-toolchain.toml`.
fn rust_line_problems(read: Reader<'_>) -> Vec<Problem> {
    let release =
        match toolchain::rust_release(RUST_TOOLCHAIN, &read(RUST_TOOLCHAIN).unwrap_or_default()) {
            Ok(release) => release,
            Err(problem) => return vec![problem],
        };
    let mut problems = toolchain::rust_version_problems(
        "Cargo.toml",
        &read("Cargo.toml").unwrap_or_default(),
        &release,
        RustVersion::Exact,
    );
    problems.extend(toolchain::image_rust_problems(
        SHIPPED_DOCKERFILE,
        &read(SHIPPED_DOCKERFILE).unwrap_or_default(),
        &release,
        RustVersion::Exact,
    ));
    problems.extend(toolchain::one_value(
        "Rust release",
        &[required(
            read,
            RELEASE_MK,
            r"(?m)^RUST_RELEASE_RUST_STD_VERSION\s*:?=\s*(\d+\.\d+\.\d+)\s*$",
        )],
        &[PinValue::new(&release, RUST_TOOLCHAIN)],
    ));
    problems.extend(toolchain::ci_toolchain_problems(
        &github_documents(read),
        &release,
        ToolchainRef::InputOrRef,
    ));
    problems
}

/// The release pins the shipped Dockerfile repeats: each tool version and each archive's
/// `(platform, asset, sha256)` arm is `.mk/rust-release.mk`'s, and every other sha256 in the
/// Dockerfile is an image or frontend digest.
fn release_pin_problems(read: Reader<'_>) -> Vec<Problem> {
    toolchain::release_pin_problems(
        SHIPPED_DOCKERFILE,
        &read(SHIPPED_DOCKERFILE).unwrap_or_default(),
        RELEASE_MK,
        &read(RELEASE_MK).unwrap_or_default(),
        &RUST_RELEASE_PINS,
    )
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

/// Go: `TestShellCheckIsOneVersion`: droast's `ShellCheck` bridge runs the shellcheck on PATH,
/// which CI installs with setup-shellcheck; it must be the release the shellcheck-py hook wraps
/// (its rev adds a fourth component for the wrapper), which Dependabot moves.
#[test]
fn shell_check_is_one_version() {
    assert_none(&shellcheck_problems(&repo_file));
}

/// The `ShellCheck` control: another release in setup-shellcheck fails.
#[test]
fn shell_check_control_fails_on_another_version() {
    let action = mutated(
        SETUP_SHELLCHECK,
        "SHELLCHECK_VERSION: v",
        "SHELLCHECK_VERSION: v9",
    );
    assert_some(&shellcheck_problems(&action), "of setup-shellcheck");
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

/// The Rust release is one exact release: `rust-toolchain.toml`'s channel, the Cargo
/// `rust-version`, the shipped Dockerfile's `dhi.io/rust` build image and its `RUST_VERSION`,
/// `.mk/rust-release.mk`'s `rust-std`, and every Rust toolchain a CI step names; a toolchain
/// action that names none must read `rust-toolchain.toml`. The image's `debian13-dev` variant is
/// held by `meta/tests/dockerfiles.rs`.
#[test]
fn rust_line_is_one_value() {
    assert_none(&rust_line_problems(&repo_file));
}

/// The CI workflow whose steps set up Rust.
const CI_WORKFLOW: &str = ".github/workflows/ci.yaml";

/// The Rust line control: another release in any one file source, a stable channel, a CI step
/// naming another toolchain, or a CI step that names none fails.
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
        (CI_WORKFLOW, format!("toolchain: {line}")),
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
    let stable = mutated(
        CI_WORKFLOW,
        &format!("toolchain: {line}"),
        "toolchain: stable",
    );
    assert_some(&rust_line_problems(&stable), "of a CI step naming stable");
    let unnamed = mutated(CI_WORKFLOW, &format!("toolchain: {line}"), "");
    assert_some(&rust_line_problems(&unnamed), "of a CI step naming none");
    let script = mutated(
        CI_WORKFLOW,
        "run: make rust-test",
        "run: cargo +nightly test",
    );
    assert_some(&rust_line_problems(&script), "of a cargo +nightly script");
}

/// What the CI rules read as a Rust toolchain: an action's `toolchain` input or non-commit ref, a
/// `RUSTUP_TOOLCHAIN` variable and a `rustup` or `cargo +` command, while an action that names
/// none is refused unless it reads `rust-toolchain.toml`.
#[test]
fn rust_toolchain_ci_rules() {
    let content = r"jobs:
  rust:
    env:
      RUSTUP_TOOLCHAIN: nightly
    steps:
      - uses: dtolnay/rust-toolchain@0123456789abcdef0123456789abcdef01234567 # master
        with:
          toolchain: 1.98.1
      - uses: dtolnay/rust-toolchain@stable
      - uses: dtolnay/rust-toolchain@0123456789abcdef0123456789abcdef01234567
      - uses: actions-rust-lang/setup-rust-toolchain@0123456789abcdef0123456789abcdef01234567
      - run: rustup toolchain install --no-self-update 1.97.0 && cargo +beta build
";
    let documents = [(
        "sample.yaml".to_owned(),
        yaml::parse("sample.yaml", content).unwrap_or_else(|problem| panic!("{problem}")),
    )];
    let (values, problems) = toolchain::ci_rust_toolchains(&documents, ToolchainRef::InputOrRef);
    let mut named: Vec<&str> = values.iter().map(|value| value.value.as_str()).collect();
    named.sort_unstable();
    assert_eq!(named, ["1.97.0", "1.98.1", "beta", "nightly", "stable"]);
    assert_eq!(
        repo_meta::strings(&problems),
        [
            "sample.yaml: dtolnay/rust-toolchain names no toolchain, and does not read \
          rust-toolchain.toml"
        ]
    );
    let wrong = toolchain::ci_toolchain_problems(&documents, "1.98.1", ToolchainRef::InputOrRef);
    assert_eq!(
        wrong.len(),
        5,
        "every toolchain but 1.98.1, and the action naming none: {wrong:?}"
    );
}

/// The zig, cargo-zigbuild and rust-std releases and every archive arm the shipped Dockerfile
/// checks are `.mk/rust-release.mk`'s, which calls itself the one record of those pins.
#[test]
fn rust_release_pins_match_the_makefile() {
    assert_none(&release_pin_problems(&repo_file));
}

static SHA256: LazyLock<Regex> = LazyLock::new(|| pattern(r"\b[0-9a-f]{64}\b"));

/// The release pin control: another zig or cargo-zigbuild release, a changed or extra sha256, or
/// an archive the `.mk` does not name fails.
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
        mutated(
            dockerfile,
            "arm64) triple=",
            &format!(
                "riscv64) triple=riscv64; std_sha256={} ;;\n\t\tarm64) triple=",
                "0".repeat(64)
            ),
        ),
        mutated(dockerfile, "SHELL [", &format!("# {changed}\nSHELL [")),
    ];
    for (index, read) in cases.iter().enumerate() {
        assert_some(&release_pin_problems(read), &format!("case {index}"));
    }
}
