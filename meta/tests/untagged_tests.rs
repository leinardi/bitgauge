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

//! Docker stays out of the untagged test run, and a gated tool is looked up in one place. The
//! Docker suites are the `testenv` targets that require the `image` or `harness` feature; every
//! other test (the `#[cfg(test)]` code and the plain test targets of every crate) runs on a plain
//! `cargo test`, which must never need a daemon. So no untagged test code runs the docker binary,
//! builds testenv's real docker runner or names the docker binary in a declaration. And the tools a
//! test may skip on are exactly the closed list of `testenv::toolgate`, which `BITGAUGE_REQUIRE_TOOLS`
//! turns into failures: no test looks a tool up on its own.
//!
//! The port of `test/toolchain/untagged_tests_test.go`. Go read the build constraints of each
//! `_test.go` file; Rust reads the `required-features` of the test targets instead.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use regex::Regex;
use testenv::toolgate::Tool;

/// The features the Docker suites sit behind.
const DOCKER_FEATURES: [&str; 2] = ["image", "harness"];

/// The manifest that declares the Docker suites.
const TESTENV_MANIFEST: &str = "testenv/Cargo.toml";

/// The one file that may look a tool up: the tool gate itself.
const TOOLGATE: &str = "testenv/src/toolgate.rs";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// What untagged test code must not contain, with the reason each names.
static DOCKER_USES: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            pattern(r#"Command[\t\n\r ]*::[\t\n\r ]*new[\t\n\r ]*\([\t\n\r ]*"docker""#),
            "runs docker",
        ),
        (
            pattern(r"DockerCli[\t\n\r ]*::[\t\n\r ]*(?:default|new)(?-u:\b)"),
            "builds testenv's docker runner",
        ),
        (
            pattern(r#"(?-u:\b)(?:const|static)[^;=]*=[\t\n\r ]*"docker"[\t\n\r ]*;"#),
            "names the docker binary in a declaration",
        ),
        (
            pattern(r"(?-u:\b)new_provider[\t\n\r ]*\("),
            "brings up a Docker test environment",
        ),
    ]
});

/// What looks a tool up outside the gate.
static TOOL_LOOKUPS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            pattern("BITGAUGE_REQUIRE_TOOLS"),
            "reads the tool gate's variable itself",
        ),
        (
            pattern(r"node_modules/\.bin"),
            "looks for an npm-installed tool itself",
        ),
        (
            pattern(r#"Command[\t\n\r ]*::[\t\n\r ]*new[\t\n\r ]*\([\t\n\r ]*"which""#),
            "runs which",
        ),
    ]
});

/// A `toolgate::lookup` call and its argument.
static LOOKUP_CALL: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"toolgate[\t\n\r ]*::[\t\n\r ]*lookup[\t\n\r ]*\(([^)]*)\)"));

/// The test targets a manifest gates behind a Docker feature: their paths, relative to the
/// manifest's directory.
fn docker_targets(manifest: &str) -> BTreeSet<String> {
    let parsed: toml::Table =
        toml::from_str(manifest).unwrap_or_else(|error| panic!("parse the manifest: {error}"));
    let Some(targets) = parsed.get("test").and_then(toml::Value::as_array) else {
        return BTreeSet::new();
    };
    targets
        .iter()
        .filter(|target| {
            target
                .get("required-features")
                .and_then(toml::Value::as_array)
                .is_some_and(|features| {
                    features
                        .iter()
                        .filter_map(toml::Value::as_str)
                        .any(|feature| DOCKER_FEATURES.contains(&feature))
                })
        })
        .filter_map(|target| target.get("path").and_then(toml::Value::as_str))
        .map(str::to_owned)
        .collect()
}

/// Whether `file` (relative to the root) belongs to a Docker suite: it is a gated target's file, or
/// sits in the directory of a gated `main.rs`.
fn in_docker_suite(file: &str, targets: &BTreeSet<String>) -> bool {
    targets.iter().any(|target| {
        let path = format!("testenv/{target}");
        file == path
            || path
                .strip_suffix("main.rs")
                .is_some_and(|directory| file.starts_with(directory))
    })
}

/// The test code of a source file: everything from its first `#[cfg(test)]` on (test modules sit
/// at the end of a file), or the whole file when it is a test module or a test target.
fn test_code(file: &str, text: &str) -> Option<String> {
    let whole = file.contains("/tests/")
        || file.starts_with("tests/")
        || file.ends_with("/tests.rs")
        || file.ends_with("/fixtures.rs");
    if whole {
        return Some(text.to_owned());
    }
    text.find("#[cfg(test)]")
        .map(|start| text[start..].to_owned())
}

/// The file this check is, whose patterns and samples name everything it refuses.
const SELF: &str = "meta/tests/untagged_tests.rs";

/// A line comment, doc comments included: prose may name what code must not do.
static LINE_COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern("//[^\n]*"));

/// The problems `rules` find in `code` without its line comments, as `<file> <reason>`.
fn problems(file: &str, code: &str, rules: &[(Regex, &str)]) -> Vec<String> {
    let code = LINE_COMMENT.replace_all(code, "");
    rules
        .iter()
        .filter(|(rule, _)| rule.is_match(&code))
        .map(|(_, reason)| format!("{file} {reason}"))
        .collect()
}

/// Every untagged test file of the workspace, with its test code.
fn untagged_test_code() -> Vec<(String, String)> {
    let targets = docker_targets(&meta::repo().read(TESTENV_MANIFEST));
    assert!(
        !targets.is_empty(),
        "{TESTENV_MANIFEST} gates no test target behind {DOCKER_FEATURES:?}"
    );
    ["src", "tests", "meta", "testenv"]
        .into_iter()
        .flat_map(|root| meta::repo().files_under(root, &[".rs"]))
        .filter(|file| file != SELF && !in_docker_suite(file, &targets))
        .filter_map(|file| {
            let code = test_code(&file, &meta::repo().read(&file))?;
            Some((file, code))
        })
        .collect()
}

/// Go: `TestUntaggedTestsAvoidDocker`: no untagged test code runs docker, builds the docker runner,
/// names the docker binary in a declaration or brings up an environment.
#[test]
fn untagged_tests_avoid_docker() {
    let files = untagged_test_code();
    assert!(
        files.iter().any(|(file, _)| file.starts_with("testenv/")),
        "no untagged testenv test code found; the check would pass on nothing"
    );
    let found: Vec<String> = files
        .iter()
        .flat_map(|(file, code)| problems(file, code, &DOCKER_USES))
        .collect();
    assert!(found.is_empty(), "{}", found.join("\n"));
}

/// Go: `TestToolGateListIsClosed`: the gated tools are exactly eslint and fallow (golangci-lint
/// left with the Go code), every gated test names one of the gate's tools, and no other code
/// looks a tool up itself.
#[test]
fn tool_gate_list_is_closed() {
    let tools: BTreeSet<&str> = Tool::ALL.iter().map(|tool| tool.name()).collect();
    assert_eq!(
        tools,
        BTreeSet::from(["eslint", "fallow"]),
        "testenv::toolgate::Tool::ALL"
    );
    let mut found = Vec::new();
    let mut lookups = 0;
    for root in ["src", "tests", "meta", "testenv"] {
        for file in meta::repo().files_under(root, &[".rs"]) {
            if file == TOOLGATE || file == SELF {
                continue;
            }
            let text = meta::repo().read(&file);
            found.extend(problems(&file, &text, &TOOL_LOOKUPS));
            let code = LINE_COMMENT.replace_all(&text, "");
            for call in LOOKUP_CALL.captures_iter(&code) {
                lookups += 1;
                if !call[1].trim_start().starts_with("Tool::") {
                    found.push(format!(
                        "{file} gates on a tool that is not a toolgate::Tool"
                    ));
                }
            }
        }
    }
    assert!(
        lookups > 0,
        "no toolgate::lookup call found; the check would pass on nothing"
    );
    assert!(found.is_empty(), "{}", found.join("\n"));
}

/// Go: `TestDockerCheckRecognizesItsTargets`: the negative control of the two checks above.
#[test]
fn docker_check_recognizes_its_targets() {
    for (sample, want) in [
        (
            r#"let out = Command::new("docker").arg("ps").output();"#,
            "runs docker",
        ),
        ("let out = Command :: new (\n\"docker\")", "runs docker"),
        (
            "let cli = DockerCli::default();",
            "builds testenv's docker runner",
        ),
        (
            "let cli = DockerCli::new(logger);",
            "builds testenv's docker runner",
        ),
        (
            r#"const DOCKER: &str = "docker";"#,
            "names the docker binary in a declaration",
        ),
        (
            "let provider = env::new_provider()?;",
            "brings up a Docker test environment",
        ),
    ] {
        let found = problems("sample.rs", sample, &DOCKER_USES);
        assert!(
            found.iter().any(|problem| problem.ends_with(want)),
            "{sample}: {found:?}"
        );
    }
    for allowed in [
        r#"let out = Command::new("git").output();"#,
        r#"assert_eq!(provider.name(), "docker");"#,
        "let cli = DockerCli { program: shell(), ..cli };",
        "// Command::new(\"docker\") in a comment\nlet a = 1;",
    ] {
        assert!(
            problems("sample.rs", allowed, &DOCKER_USES).is_empty(),
            "{allowed}"
        );
    }
    for (sample, want) in [
        (
            r#"env::var_os("BITGAUGE_REQUIRE_TOOLS")"#,
            "reads the tool gate's variable itself",
        ),
        (
            r#"root.join("web/node_modules/.bin/eslint")"#,
            "looks for an npm-installed tool itself",
        ),
        (r#"Command::new("which").arg("node")"#, "runs which"),
    ] {
        let found = problems("sample.rs", sample, &TOOL_LOOKUPS);
        assert!(
            found.iter().any(|problem| problem.ends_with(want)),
            "{sample}: {found:?}"
        );
    }
    let lookup = LOOKUP_CALL.captures("toolgate::lookup(Tool::Eslint)");
    assert_eq!(
        lookup.map(|call| call[1].to_owned()).as_deref(),
        Some("Tool::Eslint")
    );

    let manifest = r#"
[[test]]
name = "image"
path = "tests/image/main.rs"
required-features = ["image"]

[[test]]
name = "both"
path = "tests/both.rs"
required-features = ["other", "harness"]

[[test]]
name = "plain"
path = "tests/plain.rs"

[[test]]
name = "other"
path = "tests/other.rs"
required-features = ["other"]
"#;
    let targets = docker_targets(manifest);
    assert_eq!(
        targets,
        BTreeSet::from(["tests/both.rs".to_owned(), "tests/image/main.rs".to_owned()])
    );
    assert!(in_docker_suite("testenv/tests/image/probe.rs", &targets));
    assert!(in_docker_suite("testenv/tests/both.rs", &targets));
    assert!(!in_docker_suite("testenv/tests/plain.rs", &targets));
    assert!(!in_docker_suite("testenv/tests/other.rs", &targets));
    assert_eq!(
        test_code(
            "testenv/src/env.rs",
            "fn a() {}\n#[cfg(test)]\nmod tests {}"
        )
        .as_deref(),
        Some("#[cfg(test)]\nmod tests {}")
    );
    assert_eq!(test_code("testenv/src/env.rs", "fn a() {}"), None);
}
