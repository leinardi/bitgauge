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
//! The Go-era pins (the Node and Go lines, golangci-lint, `ShellCheck`, the exact web pins and the
//! action-step rules) are those of `test/toolchain/pins_test.go`. The Rust side adds the Rust
//! line (`rust-toolchain.toml`, the Cargo `rust-version`, the Rust Dockerfile's build image and
//! `RUST_VERSION`, `.mk/rust-release.mk`'s `rust-std` and every CI step that names a Rust
//! toolchain) and the release toolchain pins the Rust Dockerfile repeats from
//! `.mk/rust-release.mk`, the one record of them. What each side expects follows
//! [`TRANSITION`](meta::transition::TRANSITION): after the cutover the Go files are gone.
//!
//! The checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeMap;
use std::fs;
use std::sync::LazyLock;

use meta::repo;
use meta::transition::{
    SHIPPED_DOCKERFILE, TRANSITION, Transition, go_dockerfile, rust_dockerfile,
};
use regex::Regex;
use serde_json::Value;

/// Reads a repository file by its slash-separated path, `None` when it cannot be read.
type Reader<'reader> = &'reader dyn Fn(&str) -> Option<String>;

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The working tree as it is.
fn repo_file(file: &str) -> Option<String> {
    fs::read_to_string(repo::path(file)).ok()
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

/// The working tree with `file` absent.
fn without(file: &str) -> impl Fn(&str) -> Option<String> + use<> {
    let file = file.to_owned();
    move |name: &str| if name == file { None } else { repo_file(name) }
}

/// One place a version is written: a file and the pattern whose first group is the version
/// there. An optional source may be absent; every match of a present one counts.
struct PinSource {
    file: String,
    pattern: Regex,
    optional: bool,
}

fn required(file: &str, text: &str) -> PinSource {
    PinSource {
        file: file.to_owned(),
        pattern: pattern(text),
        optional: false,
    }
}

fn optional(file: &str, text: &str) -> PinSource {
    PinSource {
        optional: true,
        ..required(file, text)
    }
}

/// One version found, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PinValue {
    value: String,
    file: String,
}

fn pin(value: &str, file: &str) -> PinValue {
    PinValue {
        value: value.to_owned(),
        file: file.to_owned(),
    }
}

/// What is wrong unless every required source writes the pin and all the values found, the
/// `extra` ones included, agree.
fn one_value_problems(
    what: &str,
    sources: &[PinSource],
    extra: &[PinValue],
    read: Reader<'_>,
) -> Vec<String> {
    let mut problems = Vec::new();
    let mut found: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for value in extra {
        found
            .entry(value.value.clone())
            .or_default()
            .push(value.file.clone());
    }
    for source in sources {
        let Some(content) = read(&source.file) else {
            if !source.optional {
                problems.push(format!("{what}: {} cannot be read", source.file));
            }
            continue;
        };
        let mut matched = false;
        for captures in source.pattern.captures_iter(&content) {
            matched = true;
            found
                .entry(captures[1].to_owned())
                .or_default()
                .push(source.file.clone());
        }
        if !matched && !source.optional {
            problems.push(format!(
                "{what}: {} does not write it ({})",
                source.file, source.pattern
            ));
        }
    }
    if found.len() > 1 {
        let values: Vec<String> = found
            .into_iter()
            .map(|(value, mut files)| {
                files.dedup();
                format!("{value} in {}", files.join(", "))
            })
            .collect();
        problems.push(format!("{what} is not one value: {}", values.join("; ")));
    }
    problems
}

/// The actions whose inputs carry a shared pin.
const SETUP_NODE: &str = "actions/setup-node";
const SETUP_GO: &str = "actions/setup-go";
const GOLANGCI_LINT_ACTION: &str = "golangci/golangci-lint-action";
/// Keys the node-version values of every step, setup-node's and others'.
const NODE_VERSION_INPUT: &str = "node-version";

/// The actions that install a Rust toolchain, and whether each reads `rust-toolchain.toml` when
/// its `toolchain` input is absent.
const RUST_TOOLCHAIN_ACTIONS: &[(&str, bool)] = &[
    ("dtolnay/rust-toolchain", false),
    ("actions-rs/toolchain", false),
    ("actions-rust-lang/setup-rust-toolchain", true),
];

static NODE_MAJOR: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\d+$"));
static EXACT_TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"^v\d+\.\d+\.\d+$"));
static COMMIT_REF: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[0-9a-f]{40}$"));

/// A toolchain a script names: `rustup` installing or selecting one, or `cargo +<toolchain>`.
/// Option flags before the toolchain are skipped; a flag's value is read as the toolchain, which
/// errs toward a false failure, never a silent pass.
static SCRIPT_TOOLCHAIN: LazyLock<Regex> = LazyLock::new(|| {
    pattern(concat!(
        r"\brustup\s+(?:toolchain\s+install|install|default|override\s+set)\s+",
        r"(?:-\S+\s+)*([A-Za-z0-9][\w.-]*)",
        r"|\bcargo\s+\+([A-Za-z0-9][\w.-]*)",
    ))
});

/// One step, in a workflow or a composite action, that uses an action.
#[derive(Debug)]
struct ActionStep {
    file: String,
    /// The `uses:` value before its `@`.
    action: String,
    /// The `uses:` value after its `@`, empty when it has none.
    reference: String,
    with: BTreeMap<String, String>,
}

/// A YAML scalar as Go's `fmt.Sprint` writes it, which is how the Go test read the inputs.
fn scalar_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => "<nil>".to_owned(),
        Value::Bool(_) | Value::Number(_) | Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

fn parse_yaml(file: &str, content: &str) -> Value {
    serde_saphyr::from_str(content).unwrap_or_else(|error| panic!("parse {file}: {error}"))
}

/// Every mapping with a `uses:` key anywhere in the document, so job steps and composite action
/// steps alike.
fn action_steps(file: &str, document: &Value) -> Vec<ActionStep> {
    let mut steps = Vec::new();
    let mut pending = vec![document];
    while let Some(node) = pending.pop() {
        match node {
            Value::Object(map) => {
                if let Some(Value::String(uses)) = map.get("uses") {
                    let (action, reference) = uses.split_once('@').unwrap_or((uses, ""));
                    let with = match map.get("with") {
                        Some(Value::Object(inputs)) => inputs
                            .iter()
                            .map(|(key, input)| (key.clone(), scalar_text(input)))
                            .collect(),
                        _ => BTreeMap::new(),
                    };
                    steps.push(ActionStep {
                        file: file.to_owned(),
                        action: action.to_owned(),
                        reference: reference.to_owned(),
                        with,
                    });
                }
                pending.extend(map.values());
            }
            Value::Array(items) => pending.extend(items),
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
        }
    }
    steps
}

/// The pinned values by input, and a problem for every step that breaks a rule: any
/// node-version input, whatever the action or the reusable workflow that takes it, is a literal
/// Node major, and setup-node must have one; no step writes a go-version, and setup-go reads
/// `.go-version`; golangci-lint-action installs an exact version.
fn action_pins(steps: &[ActionStep]) -> (BTreeMap<&'static str, Vec<PinValue>>, Vec<String>) {
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
                    .push(pin(version, &step.file));
            } else {
                problems.push(format!(
                    "{}: {} must get node-version as a literal Node major, got {version:?}",
                    step.file, step.action
                ));
            }
        }
        if let Some(go_version) = step.with.get("go-version").filter(|text| !text.is_empty()) {
            problems.push(format!(
                "{}: {} gets go-version {go_version:?}; the Go line comes from .go-version",
                step.file, step.action
            ));
        }
        if step.action == SETUP_GO
            && step.with.get("go-version-file").map(String::as_str) != Some(".go-version")
        {
            problems.push(format!(
                "{}: setup-go must read go-version-file: .go-version",
                step.file
            ));
        }
        if step.action == GOLANGCI_LINT_ACTION {
            let version = step.with.get("version").map_or("", String::as_str);
            if EXACT_TAG.is_match(version) {
                values
                    .entry(GOLANGCI_LINT_ACTION)
                    .or_default()
                    .push(pin(version, &step.file));
            } else {
                problems.push(format!(
                    "{}: golangci-lint-action must install an exact version, got {version:?}",
                    step.file
                ));
            }
        }
    }
    (values, problems)
}

/// The Rust toolchains the steps name, and a problem for every toolchain action that names none
/// and does not read `rust-toolchain.toml` either. An action named by a ref other than a commit
/// (dtolnay's `@1.98.1` or `@stable` form) names the ref.
fn action_rust_toolchains(steps: &[ActionStep]) -> (Vec<PinValue>, Vec<String>) {
    let mut values = Vec::new();
    let mut problems = Vec::new();
    for step in steps {
        let Some(&(_, reads_file)) = RUST_TOOLCHAIN_ACTIONS
            .iter()
            .find(|(action, _)| *action == step.action)
        else {
            continue;
        };
        if let Some(toolchain) = step.with.get("toolchain") {
            values.push(pin(toolchain, &step.file));
        } else if !step.reference.is_empty() && !COMMIT_REF.is_match(&step.reference) {
            values.push(pin(&step.reference, &step.file));
        } else if !reads_file {
            problems.push(format!(
                "{}: {} names no toolchain, and does not read rust-toolchain.toml",
                step.file, step.action
            ));
        }
    }
    (values, problems)
}

/// The Rust toolchains a document names outside the toolchain actions: a `RUSTUP_TOOLCHAIN`
/// variable, and a `rustup` or `cargo +` command in any string.
fn script_rust_toolchains(file: &str, document: &Value) -> Vec<PinValue> {
    let mut values = Vec::new();
    let mut pending = vec![document];
    while let Some(node) = pending.pop() {
        match node {
            Value::Object(map) => {
                if let Some(toolchain) = map.get("RUSTUP_TOOLCHAIN") {
                    values.push(pin(&scalar_text(toolchain), file));
                }
                pending.extend(map.values());
            }
            Value::Array(items) => pending.extend(items),
            Value::String(text) => {
                for captures in SCRIPT_TOOLCHAIN.captures_iter(text) {
                    if let Some(toolchain) = captures.get(1).or_else(|| captures.get(2)) {
                        values.push(pin(toolchain.as_str(), file));
                    }
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) => {}
        }
    }
    values
}

/// Every workflow and action under `.github`, parsed.
fn github_documents(read: Reader<'_>) -> Vec<(String, Value)> {
    repo::files_under(".github", &[".yaml", ".yml"])
        .into_iter()
        .map(|file| {
            let content = read(&file).unwrap_or_else(|| panic!("read {file}"));
            let document = parse_yaml(&file, &content);
            (file, document)
        })
        .collect()
}

fn github_action_steps() -> Vec<ActionStep> {
    github_documents(&repo_file)
        .iter()
        .flat_map(|(file, document)| action_steps(file, document))
        .collect()
}

/// Every Rust toolchain CI names, and a problem for every toolchain action that names none, or
/// when no step sets up Rust at all, so the rule cannot pass on workflows it failed to see.
fn github_rust_toolchains(read: Reader<'_>) -> (Vec<PinValue>, Vec<String>) {
    let documents = github_documents(read);
    let steps: Vec<ActionStep> = documents
        .iter()
        .flat_map(|(file, document)| action_steps(file, document))
        .collect();
    let (mut values, mut problems) = action_rust_toolchains(&steps);
    if !steps.iter().any(|step| {
        RUST_TOOLCHAIN_ACTIONS
            .iter()
            .any(|(action, _)| *action == step.action)
    }) {
        problems.push("no CI step sets up a Rust toolchain".to_owned());
    }
    for (file, document) in &documents {
        values.extend(script_rust_toolchains(file, document));
    }
    (values, problems)
}

/// The Node line's sources: the web stage of every Dockerfile, the Node types, and an engines
/// field or a version file if one appears.
fn node_line_sources(transition: Transition) -> Vec<PinSource> {
    let image = r"dhi\.io/node:(\d+)-";
    let mut sources = vec![required(SHIPPED_DOCKERFILE, image)];
    if rust_dockerfile(transition) != SHIPPED_DOCKERFILE {
        sources.push(required(rust_dockerfile(transition), image));
    }
    sources.extend([
        required("web/package.json", r#""@types/node":\s*"[\^~]?(\d+)\."#),
        optional("web/package.json", r#""node":\s*"[\^~>=]*(\d+)"#),
        optional(".nvmrc", r"^v?(\d+)"),
        optional(".node-version", r"^v?(\d+)"),
    ]);
    sources
}

/// The Go line's problems: before the cutover `.go-version`, the go directive, the Go build
/// stage and the harness tools image's builder of the compatibility clients name one line; after
/// it, the Go module and its version file are gone.
fn go_line_problems(transition: Transition, read: Reader<'_>) -> Vec<String> {
    let Some(dockerfile) = go_dockerfile(transition) else {
        return [".go-version", "go.mod"]
            .into_iter()
            .filter(|file| read(file).is_some())
            .map(|file| format!("Go line: {file} outlived the cutover"))
            .collect();
    };
    one_value_problems(
        "Go line",
        &[
            required(".go-version", r"^(\d+\.\d+)\s*$"),
            required("go.mod", r"(?m)^go (\d+\.\d+)(?:\.\d+)?$"),
            required(dockerfile, r"dhi\.io/golang:(\d+\.\d+)-"),
            required(
                "test/harness/tools.Dockerfile",
                r"docker\.io/library/golang:(\d+\.\d+)-",
            ),
        ],
        &[],
        read,
    )
}

const GOLANGCI_LINT_HOOK: &str =
    r"repo: https://github\.com/golangci/golangci-lint\s+rev:\s*(v[\d.]+)";

/// golangci-lint's problems: before the cutover every golangci-lint-action step installs the
/// version the pre-commit hook pins; after it, there is no Go to lint and neither remains.
fn golangci_lint_problems(
    transition: Transition,
    steps: &[PinValue],
    read: Reader<'_>,
) -> Vec<String> {
    match transition {
        Transition::Candidate => one_value_problems(
            "golangci-lint",
            &[required(".pre-commit-config.yaml", GOLANGCI_LINT_HOOK)],
            steps,
            read,
        ),
        Transition::Done => {
            let mut problems: Vec<String> = steps
                .iter()
                .map(|step| format!("golangci-lint: {} outlived the cutover", step.file))
                .collect();
            if read(".pre-commit-config.yaml")
                .is_some_and(|config| pattern(GOLANGCI_LINT_HOOK).is_match(&config))
            {
                problems.push("golangci-lint: the pre-commit hook outlived the cutover".to_owned());
            }
            problems
        }
    }
}

fn shellcheck_sources() -> Vec<PinSource> {
    vec![
        required(
            ".pre-commit-config.yaml",
            r"repo: https://github\.com/shellcheck-py/shellcheck-py\s+rev:\s*(v\d+\.\d+\.\d+)",
        ),
        required(
            ".github/actions/setup-shellcheck/action.yaml",
            r#"SHELLCHECK_VERSION:\s*["']?(v[\d.]+)"#,
        ),
    ]
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

/// The Rust line's file sources, each an exact release: `rust-toolchain.toml`'s channel, the
/// Cargo `rust-version`, the Rust build stage's image and its `RUST_VERSION`, and the `rust-std`
/// release `.mk/rust-release.mk` pins.
fn rust_line_sources(transition: Transition) -> Vec<PinSource> {
    let dockerfile = rust_dockerfile(transition);
    vec![
        required(
            "rust-toolchain.toml",
            r#"(?m)^channel\s*=\s*"(\d+\.\d+\.\d+)"\s*$"#,
        ),
        required(
            "Cargo.toml",
            r#"(?m)^rust-version\s*=\s*"(\d+\.\d+\.\d+)"\s*$"#,
        ),
        required(
            dockerfile,
            r"(?m)^FROM\s+(?:--platform=\S+\s+)?dhi\.io/rust:(\d+\.\d+\.\d+)-debian13-dev\b",
        ),
        required(dockerfile, r"(?m)^ARG RUST_VERSION=(\d+\.\d+\.\d+)\s*$"),
        required(
            ".mk/rust-release.mk",
            r"(?m)^RUST_RELEASE_RUST_STD_VERSION\s*:?=\s*(\d+\.\d+\.\d+)\s*$",
        ),
    ]
}

/// The Rust line's problems: the file sources and every toolchain CI names are one release, and
/// every CI toolchain action names one or reads `rust-toolchain.toml`.
fn rust_line_problems(transition: Transition, read: Reader<'_>) -> Vec<String> {
    let (values, mut problems) = github_rust_toolchains(read);
    problems.extend(one_value_problems(
        "Rust line",
        &rust_line_sources(transition),
        &values,
        read,
    ));
    problems
}

const RELEASE_MK: &str = ".mk/rust-release.mk";

/// The release tool versions the Rust Dockerfile repeats, as (its `ARG`, the `.mk` variable).
const RELEASE_TOOL_VERSIONS: [(&str, &str); 2] = [
    ("ZIG_VERSION", "RUST_RELEASE_ZIG_VERSION"),
    (
        "CARGO_ZIGBUILD_VERSION",
        "RUST_RELEASE_CARGO_ZIGBUILD_VERSION",
    ),
];

/// The archives the Rust Dockerfile checks, as (its key variable, its sha256 variable, the `.mk`
/// prefix whose suffix is the key).
const RELEASE_ARCHIVES: [(&str, &str, &str); 3] = [
    ("zig_arch", "zig_sha256", "RUST_RELEASE_ZIG_SHA256_"),
    (
        "zigbuild_asset",
        "zigbuild_sha256",
        "RUST_RELEASE_CARGO_ZIGBUILD_SHA256_",
    ),
    ("triple", "std_sha256", "RUST_RELEASE_RUST_STD_SHA256_"),
];

static SHA256: LazyLock<Regex> = LazyLock::new(|| pattern(r"\b[0-9a-f]{64}\b"));
/// An image or frontend digest: its pin is the Dockerfile's own, not a release archive's.
static DIGEST: LazyLock<Regex> = LazyLock::new(|| pattern(r"@sha256:[0-9a-f]{64}\b"));

/// The problems with the release pins the Rust Dockerfile repeats: each tool version and each
/// archive's sha256 is `.mk/rust-release.mk`'s, both files name the same archives, and every
/// other sha256 in the Dockerfile is an image or frontend digest.
fn release_pin_problems(transition: Transition, read: Reader<'_>) -> Vec<String> {
    let dockerfile = rust_dockerfile(transition);
    let (Some(docker), Some(make)) = (read(dockerfile), read(RELEASE_MK)) else {
        return vec![format!("{dockerfile} or {RELEASE_MK} cannot be read")];
    };
    let mut problems = Vec::new();
    for (argument, variable) in RELEASE_TOOL_VERSIONS {
        problems.extend(one_value_problems(
            argument,
            &[
                required(dockerfile, &format!(r"(?m)^ARG {argument}=(\S+)\s*$")),
                required(RELEASE_MK, &format!(r"(?m)^{variable}\s*:?=\s*(\S+)\s*$")),
            ],
            &[],
            read,
        ));
    }
    let mut paired = 0;
    for (key, sha, prefix) in RELEASE_ARCHIVES {
        let in_docker: BTreeMap<String, String> =
            pattern(&format!(r"\b{key}=([\w.-]+);\s*{sha}=([0-9a-f]{{64}})\b"))
                .captures_iter(&docker)
                .map(|captures| (captures[1].to_owned(), captures[2].to_owned()))
                .collect();
        let in_make: BTreeMap<String, String> = pattern(&format!(
            r"(?m)^{}([\w.-]+)\s*:?=\s*([0-9a-f]{{64}})\s*$",
            regex::escape(prefix)
        ))
        .captures_iter(&make)
        .map(|captures| (captures[1].to_owned(), captures[2].to_owned()))
        .collect();
        if in_docker.is_empty() {
            problems.push(format!("{dockerfile} checks no {sha}"));
        }
        if in_docker != in_make {
            problems.push(format!(
                "{sha}: {dockerfile} has {in_docker:?}, {RELEASE_MK} has {in_make:?}"
            ));
        }
        paired += in_docker.len();
    }
    let digests = DIGEST.find_iter(&docker).count();
    let hashes = SHA256.find_iter(&docker).count();
    if hashes != paired + digests {
        problems.push(format!(
            "{dockerfile} writes {hashes} sha256s: {paired} release archives and {digests} \
             digests account for the rest, so one is not {RELEASE_MK}'s"
        ));
    }
    problems
}

fn assert_none(problems: &[String]) {
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

fn assert_some(problems: &[String], what: &str) {
    assert!(!problems.is_empty(), "the control {what} found nothing");
}

/// Go: `TestActionStepsArePinned`: no setup-node, setup-go or golangci-lint-action step under
/// `.github` leaves its version to the action's default, a range or a file the other pins do
/// not see.
#[test]
fn action_steps_are_pinned() {
    let (_, problems) = action_pins(&github_action_steps());
    assert_none(&problems);
}

/// Go: `TestNodeLineIsOneValue`: the Node major is one value everywhere it is written: the web
/// stage of the shipped Dockerfile and, before the cutover, of the Rust candidate's, the Node
/// types, an engines field or a version file if one appears, and every node-version input.
#[test]
fn node_line_is_one_value() {
    let (steps, _) = action_pins(&github_action_steps());
    let extra = steps.get(NODE_VERSION_INPUT).cloned().unwrap_or_default();
    assert_none(&one_value_problems(
        "Node line",
        &node_line_sources(TRANSITION),
        &extra,
        &repo_file,
    ));
}

/// The Node line control: another major in the Node types, in the Rust Dockerfile's web stage
/// or in a CI step fails.
#[test]
fn node_line_control_fails_on_another_major() {
    let sources = node_line_sources(TRANSITION);
    let (steps, _) = action_pins(&github_action_steps());
    let extra = steps.get(NODE_VERSION_INPUT).cloned().unwrap_or_default();
    let types = mutated(
        "web/package.json",
        r#""@types/node": "^24."#,
        r#""@types/node": "^22."#,
    );
    assert_some(
        &one_value_problems("Node line", &sources, &extra, &types),
        "of the Node types",
    );
    let image = mutated(
        rust_dockerfile(TRANSITION),
        "dhi.io/node:24-",
        "dhi.io/node:22-",
    );
    assert_some(
        &one_value_problems("Node line", &sources, &extra, &image),
        "of the Rust web stage",
    );
    let mut step = extra;
    step.push(pin("22", ".github/workflows/sample.yaml"));
    assert_some(
        &one_value_problems("Node line", &sources, &step, &repo_file),
        "of a CI step",
    );
}

/// Go: `TestGoLineIsOneValue`: `.go-version`, the go directive, the build stage image and the
/// harness tools image's builder of the compatibility clients name the same Go line (setup-go
/// reading `.go-version` is `action_steps_are_pinned`'s rule). After the cutover, the Go module
/// is gone.
#[test]
fn go_line_is_one_value() {
    assert_none(&go_line_problems(TRANSITION, &repo_file));
}

/// The Go line control: another line in go.mod, or a missing `.go-version`, fails.
#[test]
fn go_line_control_fails_on_another_line() {
    match TRANSITION {
        Transition::Candidate => {
            let module = mutated("go.mod", "go 1.26", "go 1.25");
            assert_some(&go_line_problems(TRANSITION, &module), "of go.mod");
            assert_some(
                &go_line_problems(TRANSITION, &without(".go-version")),
                "of a missing .go-version",
            );
        }
        Transition::Done => assert_some(
            &go_line_problems(TRANSITION, &|name: &str| {
                (name == "go.mod").then(|| "go 1.26\n".to_owned())
            }),
            "of a leftover go.mod",
        ),
    }
}

/// Go: `TestGolangciLintIsOneVersion`: every golangci-lint-action step installs, by an exact
/// version, the golangci-lint the pre-commit hook pins.
#[test]
fn golangci_lint_is_one_version() {
    let (steps, _) = action_pins(&github_action_steps());
    let extra = steps.get(GOLANGCI_LINT_ACTION).cloned().unwrap_or_default();
    assert_none(&golangci_lint_problems(TRANSITION, &extra, &repo_file));
}

/// The golangci-lint control: a step installing another version fails.
#[test]
fn golangci_lint_control_fails_on_another_version() {
    let (steps, _) = action_pins(&github_action_steps());
    let mut extra = steps.get(GOLANGCI_LINT_ACTION).cloned().unwrap_or_default();
    extra.push(pin("v0.0.1", ".github/workflows/sample.yaml"));
    assert_some(
        &golangci_lint_problems(TRANSITION, &extra, &repo_file),
        "of a golangci-lint step",
    );
}

/// Go: `TestShellCheckIsOneVersion`: droast's `ShellCheck` bridge runs the shellcheck on PATH,
/// which CI installs with setup-shellcheck; it must be the release the shellcheck-py hook wraps
/// (its rev adds a fourth component for the wrapper), which Dependabot moves.
#[test]
fn shell_check_is_one_version() {
    assert_none(&one_value_problems(
        "ShellCheck",
        &shellcheck_sources(),
        &[],
        &repo_file,
    ));
}

/// The `ShellCheck` control: another release in setup-shellcheck fails.
#[test]
fn shell_check_control_fails_on_another_version() {
    let action = mutated(
        ".github/actions/setup-shellcheck/action.yaml",
        "SHELLCHECK_VERSION: v",
        "SHELLCHECK_VERSION: v9",
    );
    assert_some(
        &one_value_problems("ShellCheck", &shellcheck_sources(), &[], &action),
        "of setup-shellcheck",
    );
}

/// Go: `TestExactWebPins`: the tools whose version other files must match are pinned exactly in
/// `web/package.json`, without a range.
#[test]
fn exact_web_pins() {
    assert_none(&exact_web_pin_problems(&repo::read("web/package.json")));
    let ranged = repo::read("web/package.json").replacen(r#""fallow": ""#, r#""fallow": "^"#, 1);
    assert_some(&exact_web_pin_problems(&ranged), "of a ranged fallow");
}

fn parsed_steps(file: &str, content: &str) -> Vec<ActionStep> {
    action_steps(file, &parse_yaml(file, content))
}

/// Go: `TestActionPinRules`: the negative control of the action rules: pinned steps give their
/// values, each unpinned form is a problem, and a reusable workflow's node-version input is the
/// Node line too.
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
      - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567 # v7.0.0
        with:
          go-version-file: .go-version
      - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567 # v9.3.0
        with:
          install-only: true
          version: v2.14.0
"#,
    );
    let (values, problems) = action_pins(&steps);
    assert_none(&problems);
    assert_eq!(
        values.get(NODE_VERSION_INPUT),
        Some(&vec![pin("24", "sample.yaml")])
    );
    assert_eq!(
        values.get(GOLANGCI_LINT_ACTION),
        Some(&vec![pin("v2.14.0", "sample.yaml")])
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
    - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567
      with:
        go-version: "1.26"
    - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567
    - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567
      with:
        install-only: true
    - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567
      with:
        version: latest
    - uses: some/other-action@0123456789abcdef0123456789abcdef01234567
      with:
        go-version: "1.27"
"#,
    );
    let (values, problems) = action_pins(&steps);
    assert!(
        problems.len() == 9 && values.is_empty(),
        "unpinned steps: want 9 problems and no values, got {values:?} and {problems:?}"
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
        Some(&vec![pin("22", "ci.yaml")])
    );
    assert_eq!(problems.len(), 1, "reusable workflow inputs: {problems:?}");
}

/// The Rust line is one exact release: `rust-toolchain.toml`'s channel, the Cargo
/// `rust-version`, the Rust Dockerfile's `dhi.io/rust:<line>-debian13-dev` build image and its
/// `RUST_VERSION`, `.mk/rust-release.mk`'s `rust-std`, and every Rust toolchain a CI step names;
/// a toolchain action that names none must read `rust-toolchain.toml`.
#[test]
fn rust_line_is_one_value() {
    assert_none(&rust_line_problems(TRANSITION, &repo_file));
}

/// The CI workflow whose steps set up Rust.
const CI_WORKFLOW: &str = ".github/workflows/ci.yaml";

/// The Rust line control: another release in any one file source, a stable channel, a CI step
/// naming another toolchain, or a CI step that names none fails.
#[test]
fn rust_line_control_fails_on_another_release() {
    let line = pattern(r#"(?m)^channel\s*=\s*"([^"]+)""#)
        .captures(&repo::read("rust-toolchain.toml"))
        .map_or_else(
            || panic!("rust-toolchain.toml names no channel"),
            |captures| captures[1].to_owned(),
        );
    let dockerfile = rust_dockerfile(TRANSITION);
    let cases = [
        ("rust-toolchain.toml", format!(r#"channel = "{line}""#)),
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
        assert_some(&rust_line_problems(TRANSITION, &read), &text);
    }
    let channel = mutated(
        "rust-toolchain.toml",
        &format!(r#"channel = "{line}""#),
        r#"channel = "stable""#,
    );
    assert_some(
        &rust_line_problems(TRANSITION, &channel),
        "of a stable channel",
    );
    let stable = mutated(
        CI_WORKFLOW,
        &format!("toolchain: {line}"),
        "toolchain: stable",
    );
    assert_some(
        &rust_line_problems(TRANSITION, &stable),
        "of a CI step naming stable",
    );
    let unnamed = mutated(CI_WORKFLOW, &format!("toolchain: {line}"), "");
    assert_some(
        &rust_line_problems(TRANSITION, &unnamed),
        "of a CI step naming none",
    );
    let script = mutated(
        CI_WORKFLOW,
        "run: make rust-test",
        "run: cargo +nightly test",
    );
    assert_some(
        &rust_line_problems(TRANSITION, &script),
        "of a cargo +nightly script",
    );
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
    let document = parse_yaml("sample.yaml", content);
    let (mut values, problems) = action_rust_toolchains(&action_steps("sample.yaml", &document));
    values.extend(script_rust_toolchains("sample.yaml", &document));
    let mut named: Vec<&str> = values.iter().map(|value| value.value.as_str()).collect();
    named.sort_unstable();
    assert_eq!(named, ["1.97.0", "1.98.1", "beta", "nightly", "stable"]);
    assert_eq!(
        problems,
        [
            "sample.yaml: dtolnay/rust-toolchain names no toolchain, and does not read \
          rust-toolchain.toml"
        ]
    );
}

/// The zig and cargo-zigbuild releases and every archive sha256 the Rust Dockerfile checks are
/// `.mk/rust-release.mk`'s, which calls itself the one record of those pins.
#[test]
fn rust_release_pins_match_the_makefile() {
    assert_none(&release_pin_problems(TRANSITION, &repo_file));
}

/// The release pin control: another zig or cargo-zigbuild release, a changed or extra sha256, or
/// an archive the `.mk` does not name fails.
#[test]
fn rust_release_pin_control_fails_on_a_change() {
    let dockerfile = rust_dockerfile(TRANSITION);
    let docker = repo::read(dockerfile);
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
        assert_some(
            &release_pin_problems(TRANSITION, read),
            &format!("case {index}"),
        );
    }
}
