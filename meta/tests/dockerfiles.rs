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

//! The image and release invariants of build-packaging.md sections 1, 2, 4 and 6, ported from
//! `test/dockerfiles`: the Dockerfiles' stages, bases, pins and runtime posture, the version
//! stamps, which Dockerfiles may be built and by what, the release platforms, and what
//! `release.yaml` publishes and how.
//!
//! The assertions are transitional (`docs/rust-port.md`, Implementation Identity): they read the
//! Dockerfiles through [`meta::transition`]. Before the cutover the shipped Dockerfile is the Go
//! build, held to every check the Go tests make, and `Dockerfile.rust` is the test-only Rust
//! candidate, held to the Rust build's pins and to the shipped web and runtime stages; after it,
//! the Rust Dockerfile is the shipped one and the Go checks fall away. Every check is a function
//! of the text, and each is also run on input built to break it.

#[path = "dockerfiles/images.rs"]
mod images;
#[path = "dockerfiles/reader.rs"]
mod reader;
#[path = "dockerfiles/release.rs"]
mod release;

use std::collections::BTreeMap;
use std::fs;
use std::sync::LazyLock;

use meta::repo;
use meta::transition::{
    SHIPPED_DOCKERFILE, TRANSITION, Transition, go_dockerfile, rust_dockerfile,
};
use regex::Regex;

use images::{GO_BUILD_REPOSITORY, RUST_BUILD_REPOSITORY};
use release::{RELEASE_IMAGE, RELEASE_WORKFLOW, WANT_PLATFORMS};

const SHIPPED_DIR: &str = "deployments/docker";
const WORKFLOWS_DIR: &str = ".github/workflows";
const MAKEFILE: &str = "Makefile";
const RUST_TOOLCHAIN: &str = "rust-toolchain.toml";
const RUST_RELEASE_MK: &str = ".mk/rust-release.mk";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

fn base_name(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, name)| name)
}

/// The Rust candidate, while there is one: the Rust Dockerfile when it is not the shipped one.
fn candidate(transition: Transition) -> Option<&'static str> {
    Some(rust_dockerfile(transition)).filter(|path| *path != SHIPPED_DOCKERFILE)
}

/// The image Dockerfiles at `transition`, each with the repository its build stage starts from:
/// the Rust one always, and the Go one while it exists.
fn image_dockerfiles(transition: Transition) -> Vec<(&'static str, &'static str)> {
    let mut images = vec![(rust_dockerfile(transition), RUST_BUILD_REPOSITORY)];
    if let Some(go) = go_dockerfile(transition) {
        images.push((go, GO_BUILD_REPOSITORY));
    }
    images
}

/// Matches Dockerfile, `<name>.Dockerfile` and `Dockerfile.<name>`, but not the
/// `Dockerfile.<name>.dockerignore` that `BuildKit` reads beside one.
fn is_dockerfile(name: &str) -> bool {
    name == "Dockerfile"
        || name.ends_with(".Dockerfile")
        || (name.starts_with("Dockerfile.") && !name.ends_with(".dockerignore"))
}

/// Every Dockerfile in the repository, tracked or new. Asking git rather than walking keeps the
/// ignored trees (`target/`, `node_modules/`, `dist/`) out without naming them.
fn all_dockerfiles() -> Vec<String> {
    let found: Vec<String> = repo::tracked_or_new(&["*Dockerfile*"])
        .into_iter()
        .filter(|path| is_dockerfile(base_name(path)))
        .collect();
    assert!(
        found.iter().any(|path| path == SHIPPED_DOCKERFILE),
        "the search did not find {SHIPPED_DOCKERFILE}, so it would find nothing else either"
    );
    found
}

/// The workflow files directly under `.github/workflows`.
fn workflows() -> Vec<String> {
    repo::files_under(WORKFLOWS_DIR, &[".yaml", ".yml"])
        .into_iter()
        .filter(|path| {
            path.strip_prefix(WORKFLOWS_DIR)
                .is_some_and(|rest| rest.matches('/').count() == 1)
        })
        .collect()
}

fn rust_pins() -> images::RustPins {
    images::rust_pins(&repo::read(RUST_TOOLCHAIN), &repo::read(RUST_RELEASE_MK))
        .unwrap_or_else(|error| panic!("read the Rust release pins: {error}"))
}

/// What `deployments/docker` may hold at `transition`: the shipped Dockerfile and, until the
/// cutover, the Rust candidate beside it. `names` are the Dockerfiles found there.
fn docker_dir_problems(transition: Transition, names: &[String]) -> Vec<String> {
    let mut want: Vec<&str> = [Some(SHIPPED_DOCKERFILE), candidate(transition)]
        .into_iter()
        .flatten()
        .map(base_name)
        .collect();
    want.sort_unstable();
    let mut found: Vec<&str> = names.iter().map(String::as_str).collect();
    found.sort_unstable();
    if found == want {
        Vec::new()
    } else {
        vec![format!(
            "{SHIPPED_DIR} holds {found:?}, want exactly {want:?}"
        )]
    }
}

/// The syntax directive of `content`: a docker/dockerfile frontend pinned by digest. A bare
/// docker/dockerfile:1.7 is a tag that can be moved under a build, and Dependabot never updates
/// the line. An image Dockerfile must carry one (`required`); another may use the builder's
/// default frontend, but if it names one, the same rule holds.
fn syntax_problems(path: &str, content: &str, required: bool) -> Vec<String> {
    let Some(syntax) = reader::syntax(content) else {
        return if required {
            vec![format!(
                "{path} has no syntax parser directive on its first line"
            )]
        } else {
            Vec::new()
        };
    };
    let mut problems = Vec::new();
    if reader::repository(&syntax) != "docker/dockerfile" {
        problems.push(format!(
            "{path} reads with the frontend {syntax:?}, want docker/dockerfile"
        ));
    }
    if !reader::digest_pinned(&syntax) {
        problems.push(format!(
            "{path} reads with the frontend {syntax:?}, which is not pinned by digest"
        ));
    }
    problems
}

static DOCKER_TARGETS: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^DOCKER_TARGETS\s*:?=\s*(.*)$"));

/// The Makefile builds one image, bitgauge, from the shipped Dockerfile.
fn makefile_target_problems(makefile: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let targets = DOCKER_TARGETS
        .captures(makefile)
        .and_then(|found| found.get(1))
        .map(|targets| targets.as_str().split_whitespace().collect::<Vec<_>>());
    if targets.as_deref() != Some(&["bitgauge"]) {
        problems.push(format!(
            "DOCKER_TARGETS is {targets:?}, want exactly bitgauge"
        ));
    }
    if !makefile.contains(&format!("DOCKERFILE_bitgauge := {SHIPPED_DOCKERFILE}\n")) {
        problems.push(format!(
            "DOCKERFILE_bitgauge does not name {SHIPPED_DOCKERFILE}"
        ));
    }
    problems
}

/// A Dockerfile other than the shipped one: its bases pinned by the shipped one's rule (a dhi.io
/// base by an explicit tag alone, any other base by tag and digest), and never named by the
/// files that build or release the product image (`referrers`, path to text).
fn test_image_problems(
    path: &str,
    content: &str,
    referrers: &BTreeMap<&str, String>,
) -> Vec<String> {
    let mut problems = Vec::new();
    match reader::parse(content) {
        Ok(stages) => {
            for stage in stages {
                if !reader::base_pinned(&stage.image) {
                    problems.push(format!(
                        "{path}: FROM {:?} is neither a dhi.io reference pinned by an explicit \
                         tag alone nor another literal reference pinned by tag and digest",
                        stage.image
                    ));
                }
            }
        }
        Err(error) => problems.push(format!("{path}: {error}")),
    }
    for (referrer, text) in referrers {
        if text.contains(path) || text.contains(base_name(path)) {
            problems.push(format!(
                "{referrer} references {path}, which is a test image and never shipped"
            ));
        }
    }
    problems
}

/// A workflow that names the candidate would build or publish it before the cutover.
fn candidate_workflow_problems(workflow: &str, content: &str, candidate: &str) -> Vec<String> {
    if content.contains(base_name(candidate)) {
        vec![format!(
            "{workflow} names {candidate}, which no workflow builds or publishes"
        )]
    } else {
        Vec::new()
    }
}

static PLATFORM_DECLARATION: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?mi)^\s*(?:-\s*)?(platforms?|PLATFORMS)\s*:\s*(.+)$"));

/// The two platforms (decisions.md section 27) wherever a workflow names platforms:
/// dhi.io/static has no arm/v7.
fn platform_problems(workflow: &str, content: &str) -> Vec<String> {
    let mut problems = Vec::new();
    for found in PLATFORM_DECLARATION.captures_iter(content) {
        let key = found.get(1).map_or("", |key| key.as_str());
        let value = found
            .get(2)
            .map_or("", |value| value.as_str())
            .trim()
            .trim_matches(['"', '\'']);
        if value.starts_with("${{") {
            continue;
        }
        if value != WANT_PLATFORMS {
            problems.push(format!(
                "{workflow} declares {key} {value:?}, want {WANT_PLATFORMS:?}"
            ));
        }
    }
    if content.contains("linux/arm/v") || content.contains("linux/386") {
        problems.push(format!(
            "{workflow} names a platform other than {WANT_PLATFORMS}"
        ));
    }
    problems
}

/// One way to break a file: replace the first `old` with `new`, or, with `regex`, the first match
/// of `old` with `new` expanded against its groups.
struct Mutation {
    name: &'static str,
    old: String,
    new: String,
    regex: bool,
}

fn literal(name: &'static str, old: impl Into<String>, new: impl Into<String>) -> Mutation {
    Mutation {
        name,
        old: old.into(),
        new: new.into(),
        regex: false,
    }
}

fn regex(name: &'static str, old: impl Into<String>, new: impl Into<String>) -> Mutation {
    Mutation {
        name,
        old: old.into(),
        new: new.into(),
        regex: true,
    }
}

fn mutate(content: &str, mutation: &Mutation) -> String {
    if mutation.regex {
        pattern(&mutation.old)
            .replacen(content, 1, mutation.new.as_str())
            .into_owned()
    } else {
        content.replacen(&mutation.old, &mutation.new, 1)
    }
}

/// Asserts that `check` passes on `content` and finds a problem in each mutated copy. A mutation
/// that changes nothing would pass the control while checking nothing, so it fails it.
fn assert_refuses(
    file: &str,
    content: &str,
    check: impl Fn(&str) -> Vec<String>,
    mutations: &[Mutation],
) {
    let baseline = check(content);
    assert!(
        baseline.is_empty(),
        "the unmutated {file} already fails: {baseline:?}"
    );
    for mutation in mutations {
        let mutated = mutate(content, mutation);
        assert_ne!(
            mutated, content,
            "{}: {file} does not contain {:?}, so the control checks nothing",
            mutation.name, mutation.old
        );
        assert!(
            !check(&mutated).is_empty(),
            "{}: the check passes {file} with the mutation applied",
            mutation.name
        );
    }
}

fn assert_no_problems(problems: &[String]) {
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestShippedDockerfileIsTheOnlyOne`. `deployments/docker` holds exactly the image that
/// ships and, until the cutover, the Rust candidate beside it. Any other file there would look
/// shipped to every reader and be built by nothing.
#[test]
fn shipped_dockerfile_is_the_only_one() {
    let names: Vec<String> = fs::read_dir(repo::path(SHIPPED_DIR))
        .unwrap_or_else(|error| panic!("read {SHIPPED_DIR}: {error}"))
        .map(|entry| {
            entry
                .unwrap_or_else(|error| panic!("read {SHIPPED_DIR}: {error}"))
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .filter(|name| is_dockerfile(name))
        .collect();
    assert_no_problems(&docker_dir_problems(TRANSITION, &names));
}

/// Go: `TestRustCandidateIsTestOnly`. The candidate image is built only by make rust-image: the
/// search finds it, so `other_dockerfiles_are_test_only` holds it to the pinning rule and keeps
/// the Makefile and the release workflow from naming it, and no workflow names it either, so
/// nothing builds or publishes it before the cutover. After the cutover there is no candidate.
#[test]
fn rust_candidate_is_test_only() {
    let Some(candidate) = candidate(TRANSITION) else {
        return;
    };
    assert!(
        all_dockerfiles().iter().any(|path| path == candidate),
        "the search did not find {candidate}"
    );
    let problems: Vec<String> = workflows()
        .iter()
        .flat_map(|workflow| {
            candidate_workflow_problems(workflow, &repo::read(workflow), candidate)
        })
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestSyntaxDirectiveIsPinned`. Each Dockerfile's `BuildKit` frontend, when it names one, is
/// docker/dockerfile pinned by digest (build-packaging.md section 1); the image Dockerfiles, the
/// shipped one and the Rust one, must name one.
#[test]
fn syntax_directive_is_pinned() {
    let images = image_dockerfiles(TRANSITION);
    let problems: Vec<String> = all_dockerfiles()
        .iter()
        .flat_map(|path| {
            let required = images.iter().any(|(image, _)| image == path);
            syntax_problems(path, &repo::read(path), required)
        })
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestShippedStages`. The three named stages, in order, each from a literal dhi.io base
/// pinned by an explicit tag and no digest; held for the Rust Dockerfile too, which becomes the
/// shipped one at the cutover.
#[test]
fn shipped_stages() {
    let problems: Vec<String> = image_dockerfiles(TRANSITION)
        .iter()
        .flat_map(|(path, _)| images::layout_problems(path, &repo::read(path)))
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestBuildStages`. Both build stages run on the build platform, web from dhi.io/node and
/// build from dhi.io/golang in the Go Dockerfile and dhi.io/rust in the Rust one. The tags'
/// toolchain lines are the toolchain pins' (meta/tests/toolchain.rs).
#[test]
fn build_stages() {
    let problems: Vec<String> = image_dockerfiles(TRANSITION)
        .iter()
        .flat_map(|(path, repository)| {
            images::build_stage_problems(path, &repo::read(path), repository)
        })
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestRuntimeStage`. The posture of the image that ships: no shell, nothing to write to,
/// an unprivileged numeric user, the healthcheck in exec form and the seven OCI labels; held for
/// the Rust Dockerfile too.
#[test]
fn runtime_stage() {
    let problems: Vec<String> = image_dockerfiles(TRANSITION)
        .iter()
        .flat_map(|(path, _)| images::runtime_problems(path, &repo::read(path)))
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestBuildinfoIsStamped`. While the Go build exists, the version comes from
/// internal/buildinfo, in its image and in make go-build alike; a path that stamped package main
/// would ship a binary reporting "dev". The Rust build's stamps are `rust_build_stage`'s.
#[test]
fn buildinfo_is_stamped() {
    let Some(go) = go_dockerfile(TRANSITION) else {
        return;
    };
    let problems: Vec<String> = [go, MAKEFILE]
        .iter()
        .flat_map(|path| images::go_stamp_problems(path, &repo::read(path)))
        .collect();
    assert_no_problems(&problems);
}

/// The Makefile and release.yaml, the files that build and release the product image.
fn referrers() -> BTreeMap<&'static str, String> {
    let mut referrers = BTreeMap::from([(MAKEFILE, repo::read(MAKEFILE))]);
    if repo::path(RELEASE_WORKFLOW).is_file() {
        referrers.insert(RELEASE_WORKFLOW, repo::read(RELEASE_WORKFLOW));
    }
    referrers
}

/// Go: `TestOtherDockerfilesAreTestOnly`. The Makefile builds one image, bitgauge, from the
/// shipped Dockerfile, and every other Dockerfile follows the shipped one's pinning rule and is
/// never built or released as a product image.
#[test]
fn other_dockerfiles_are_test_only() {
    let mut problems = makefile_target_problems(&repo::read(MAKEFILE));
    let referrers = referrers();
    for path in all_dockerfiles() {
        if path != SHIPPED_DOCKERFILE {
            problems.extend(test_image_problems(&path, &repo::read(&path), &referrers));
        }
    }
    assert_no_problems(&problems);
}

/// Go: `TestPlatforms`. Every workflow that names platforms names exactly linux/amd64 and
/// linux/arm64 (decisions.md section 27).
#[test]
fn platforms() {
    let problems: Vec<String> = workflows()
        .iter()
        .flat_map(|workflow| platform_problems(workflow, &repo::read(workflow)))
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestReleaseWorkflow`. What release.yaml publishes and how (docs/release.md,
/// build-packaging.md sections 2, 4 and 6): the binaries carry the version stamps of the build
/// that ships, the image is built for exactly the two platforms, GHCR is the only registry
/// anything is pushed to and ghcr.io/leinardi/bitgauge the only image there, and the tools,
/// actions and images it runs are pinned.
#[test]
fn release_workflow() {
    assert_no_problems(&release::release_problems(
        TRANSITION,
        &repo::read(RELEASE_WORKFLOW),
    ));
}

/// The mutations of `release_checks_refuse_mutations`, one broken rule each: the stamp of the
/// build that ships at `TRANSITION`, then the Go-era list.
fn release_mutations() -> Vec<Mutation> {
    let stamp = match TRANSITION {
        Transition::Candidate => literal(
            "buildinfo.commit stamped elsewhere",
            "internal/buildinfo.commit=",
            "main.commit=",
        ),
        Transition::Done => literal("BITGAUGE_COMMIT unset", "BITGAUGE_COMMIT=", "COMMIT="),
    };
    vec![
        stamp,
        literal(
            "a third platform",
            format!("PLATFORMS: {WANT_PLATFORMS}"),
            format!("PLATFORMS: {WANT_PLATFORMS},linux/arm/v7"),
        ),
        literal(
            "the image on Docker Hub",
            format!("IMAGE: {RELEASE_IMAGE}"),
            "IMAGE: docker.io/leinardi/bitgauge",
        ),
        literal(
            "another GHCR image",
            r#"-t "$IMAGE:latest""#,
            r#"-t "$IMAGE:latest" -t "ghcr.io/leinardi/other:latest""#,
        ),
        literal(
            "a pointer on another image",
            r#"-t "$IMAGE:latest""#,
            r#"-t "$MIRROR:latest""#,
        ),
        literal(
            "a login to another registry",
            "registry: dhi.io",
            "registry: quay.io",
        ),
        literal(
            "the build pushed to GHCR",
            "name=${{ env.LOCAL_IMAGE }}",
            "name=${{ env.IMAGE }}",
        ),
        literal(
            "the build tagged by the push input",
            "sbom: true",
            "sbom: true\n          push: true",
        ),
        literal(
            "a copy to another image",
            r#""docker://$IMAGE@$DIGEST""#,
            r#""docker://$MIRROR@$DIGEST""#,
        ),
        literal(
            "a signature on another image",
            r#"cosign sign --yes "$IMAGE@"#,
            r#"cosign sign --yes "$MIRROR@"#,
        ),
        literal(
            "an attestation pushed elsewhere",
            "subject-name: ${{ env.IMAGE }}",
            "subject-name: ${{ env.LOCAL_IMAGE }}",
        ),
        regex(
            "an unpinned Trivy",
            r"TRIVY_VERSION: v[\d.]+",
            "TRIVY_VERSION: latest",
        ),
        regex(
            "an unpinned svu",
            r"SVU_VERSION: v[\d.]+",
            "SVU_VERSION: latest",
        ),
        regex(
            "an action by tag",
            r"uses: ([\w./-]+)@[0-9a-f]{40} # v[\d.]+",
            "uses: ${1}@v7",
        ),
        regex(
            "an action with no version comment",
            r"uses: ([\w./-]+@[0-9a-f]{40}) # v[\d.]+",
            "uses: ${1}",
        ),
        regex(
            "the registry image by tag",
            r"REGISTRY_IMAGE: (\S+)@sha256:[0-9a-f]+",
            "REGISTRY_IMAGE: ${1}",
        ),
    ]
}

/// Go: `TestReleaseChecksRefuseMutations`. The negative control of `release_workflow`:
/// release.yaml with one rule broken at a time has to come out with a broken rule, not a parse
/// error, which would pass while checking no rule.
#[test]
fn release_checks_refuse_mutations() {
    let mutations = release_mutations();
    let check = |text: &str| {
        let problems = release::release_problems(TRANSITION, text);
        // A mutation that broke the YAML would pass on the parse error alone, checking no rule.
        assert!(
            !problems
                .first()
                .is_some_and(|first| first.starts_with("parse ")),
            "the mutated {RELEASE_WORKFLOW} does not parse: {problems:?}"
        );
        problems
    };
    assert_refuses(
        RELEASE_WORKFLOW,
        &repo::read(RELEASE_WORKFLOW),
        check,
        &mutations,
    );
}

const DIGEST: &str = "@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// The pinning predicates of the reader on references that must pass and must not.
fn assert_reference_rules() {
    for (name, image) in [
        ("a tag only", "dhi.io/static:20250419".to_owned()),
        (
            "a variable tag",
            format!("dhi.io/golang:${{GO_LINE}}-alpine3.23-dev{DIGEST}"),
        ),
        ("a variable image", format!("$BASE{DIGEST}")),
        (
            "a short digest",
            "dhi.io/static:20250419@sha256:0123".to_owned(),
        ),
        ("a digest with no tag", format!("dhi.io/static{DIGEST}")),
        ("a stage name, not a ref", "build".to_owned()),
    ] {
        assert!(
            !reader::digest_pinned(&image),
            "{name} ({image:?}) passes as digest-pinned"
        );
    }
    assert!(
        reader::digest_pinned(&format!("dhi.io/static:20250419{DIGEST}")),
        "a literal tag plus digest does not pass as digest-pinned"
    );
    for (name, image) in [
        ("no tag", "dhi.io/static".to_owned()),
        ("latest", "dhi.io/static:latest".to_owned()),
        ("latest, upper-cased", "dhi.io/static:LATEST".to_owned()),
        (
            "a tag plus digest",
            format!("dhi.io/static:20250419{DIGEST}"),
        ),
        (
            "a variable tag",
            "dhi.io/golang:${GO_LINE}-alpine3.23-dev".to_owned(),
        ),
        ("a variable image", "$BASE".to_owned()),
        ("an empty tag", "dhi.io/static:".to_owned()),
        ("a stage name, not a ref", "build".to_owned()),
    ] {
        assert!(
            !reader::tag_pinned(&image),
            "{name} ({image:?}) passes as pinned by an explicit tag alone"
        );
    }
    assert!(
        reader::tag_pinned("dhi.io/golang:1.26-alpine3.23-dev"),
        "a literal explicit tag does not pass as tag-pinned"
    );
    for (image, want) in [
        ("dhi.io/static:20250419".to_owned(), true),
        (format!("dhi.io/static:20250419{DIGEST}"), false),
        ("dhi.io/static:latest".to_owned(), false),
        (format!("docker.io/library/alpine:3.23{DIGEST}"), true),
        ("docker.io/library/alpine:3.23".to_owned(), false),
        ("evil.example/dhi.io/static:20250419".to_owned(), false),
    ] {
        assert_eq!(reader::base_pinned(&image), want, "base_pinned({image:?})");
    }
}

fn joined(stage: &reader::Stage) -> String {
    stage
        .instructions
        .iter()
        .map(|instruction| format!("{} {}", instruction.keyword, instruction.args))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Go: `TestParseRejectsWhatTheAssertionsMustNotMiss`. The negative control for the reader: each
/// of these inputs has to come out as something the assertions refuse, and the inputs that are
/// pinned or well formed as what they are.
#[test]
fn parse_rejects_what_the_assertions_must_not_miss() {
    assert_reference_rules();
    let stages = reader::parse(&format!(
        "FROM a:1{DIGEST} AS one\nRUN echo \\\n  two\n# note\nFROM b:2{DIGEST}\nUSER 1:1\n"
    ))
    .unwrap_or_else(|error| panic!("parse: {error}"));
    assert!(
        matches!(stages.as_slice(), [one, two]
            if one.name == "one" && two.name.is_empty()
                && joined(one) == "RUN echo two" && joined(two) == "USER 1:1"),
        "parsed {stages:?}"
    );

    for (name, content) in [
        ("no directive", format!("FROM a:1{DIGEST}\n")),
        (
            "after a comment",
            format!("# note\n# syntax=docker/dockerfile:1.7{DIGEST}\n"),
        ),
        (
            "after a blank line",
            format!("\n# syntax=docker/dockerfile:1.7{DIGEST}\n"),
        ),
        (
            "after an instruction",
            format!("FROM a:1{DIGEST}\n# syntax=docker/dockerfile:1.7{DIGEST}\n"),
        ),
        ("a directive with no value", "# syntax=\n".to_owned()),
    ] {
        let syntax = reader::syntax(&content);
        assert!(
            syntax.is_none(),
            "{name}: read the syntax directive {syntax:?}, which BuildKit ignores"
        );
    }
    let syntax = reader::syntax(&format!(
        "# check=error=true\n#Syntax = docker/dockerfile:1.7{DIGEST}\n"
    ));
    assert_eq!(
        syntax,
        Some(format!("docker/dockerfile:1.7{DIGEST}")),
        "a directive after another directive"
    );

    assert!(
        reader::parse(&format!("FROM a:1{DIGEST}\nRUN echo \\\n")).is_err(),
        "a file ending inside a continuation parsed"
    );
}

/// The negative control of `shipped_stages`: an image Dockerfile with a stage unpinned, from
/// another registry, unnamed or renamed.
#[test]
fn layout_checks_refuse_mutations() {
    for (path, _) in image_dockerfiles(TRANSITION) {
        let content = repo::read(path);
        let runtime = "dhi.io/static:20250419";
        assert_refuses(
            path,
            &content,
            |text| images::layout_problems(path, text),
            &[
                literal("a stage by digest", runtime, format!("{runtime}{DIGEST}")),
                literal("a stage by latest", runtime, "dhi.io/static:latest"),
                literal(
                    "a stage from Docker Hub",
                    runtime,
                    format!("docker.io/library/busybox:1.37{DIGEST}"),
                ),
                literal("an unnamed stage", " AS runtime", ""),
                literal("a renamed stage", " AS web", " AS assets"),
            ],
        );
    }
}

/// The negative control of `build_stages`: a build stage emulated or from another base.
#[test]
fn build_stage_checks_refuse_mutations() {
    for (path, repository) in image_dockerfiles(TRANSITION) {
        let content = repo::read(path);
        assert_refuses(
            path,
            &content,
            |text| images::build_stage_problems(path, text, repository),
            &[
                literal(
                    "the web stage emulated",
                    "--platform=$BUILDPLATFORM dhi.io/node",
                    "dhi.io/node",
                ),
                literal(
                    "the web stage from another base",
                    "dhi.io/node:",
                    "dhi.io/bun:",
                ),
                regex(
                    "the build stage emulated",
                    r"--platform=\$BUILDPLATFORM (dhi\.io/(?:golang|rust))",
                    "${1}",
                ),
                regex(
                    "the build stage from another base",
                    r"dhi\.io/(?:golang|rust):",
                    "dhi.io/gcc:",
                ),
            ],
        );
    }
}

/// The negative control of `runtime_stage`: a runtime stage broken one way at a time.
#[test]
fn runtime_checks_refuse_mutations() {
    for (path, _) in image_dockerfiles(TRANSITION) {
        let content = repo::read(path);
        assert_refuses(
            path,
            &content,
            |text| images::runtime_problems(path, text),
            &[
                literal("a shell base", "dhi.io/static:", "dhi.io/busybox:"),
                literal(
                    "a pinned platform",
                    "FROM dhi.io/static",
                    "FROM --platform=linux/amd64 dhi.io/static",
                ),
                literal("root", "USER 65532:65532", "USER 0:0"),
                literal("a second port", "EXPOSE 8080", "EXPOSE 8080 9090"),
                literal(
                    "a shell entrypoint",
                    r#"ENTRYPOINT ["/bitgauge"]"#,
                    "ENTRYPOINT /bitgauge",
                ),
                literal(
                    "the binary elsewhere",
                    "/out/bitgauge /bitgauge",
                    "/out/bitgauge /usr/bin/bitgauge",
                ),
                literal("a volume", "EXPOSE 8080", "EXPOSE 8080\nVOLUME /data"),
                literal(
                    "a shell healthcheck",
                    r#"CMD ["/bitgauge", "healthcheck"]"#,
                    "CMD /bitgauge healthcheck",
                ),
                literal(
                    "a second healthcheck",
                    "ENTRYPOINT",
                    "HEALTHCHECK NONE\nENTRYPOINT",
                ),
                literal(
                    "a wrong revision label",
                    r#"revision="${COMMIT}""#,
                    r#"revision="${VERSION}""#,
                ),
                literal(
                    "no description",
                    "org.opencontainers.image.description=",
                    "org.opencontainers.image.summary=",
                ),
                literal(
                    "an extra label",
                    "org.opencontainers.image.licenses=",
                    "org.example.extra=1 org.opencontainers.image.licenses=",
                ),
            ],
        );
    }
}

/// The negative control of `syntax_directive_is_pinned` on the image Dockerfiles: no
/// directive, one by tag alone, or another frontend.
#[test]
fn syntax_checks_refuse_mutations() {
    for (path, _) in image_dockerfiles(TRANSITION) {
        let content = repo::read(path);
        assert_refuses(
            path,
            &content,
            |text| syntax_problems(path, text, true),
            &[
                regex("no directive", r"\A# syntax=\S+\n", ""),
                regex(
                    "the directive by tag",
                    r"\A(# syntax=docker/dockerfile:1\.7)@sha256:[0-9a-f]+",
                    "${1}",
                ),
                literal(
                    "another frontend",
                    "# syntax=docker/dockerfile:",
                    "# syntax=example/dockerfile:",
                ),
            ],
        );
    }
}

/// The negative control of `buildinfo_is_stamped`: a Go build file with a field unstamped, one
/// stamped in package main, or a stamp of main.version beside the real ones.
#[test]
fn buildinfo_checks_refuse_mutations() {
    if let Some(go) = go_dockerfile(TRANSITION) {
        for path in [go, MAKEFILE] {
            assert_refuses(
                path,
                &repo::read(path),
                |text| images::go_stamp_problems(path, text),
                &[
                    literal(
                        "the version unstamped",
                        "internal/buildinfo.version=",
                        "internal/buildinfo.release=",
                    ),
                    literal(
                        "the date stamped in main",
                        "github.com/leinardi/bitgauge/internal/buildinfo.date=",
                        "main.date=",
                    ),
                    regex(
                        "main.version stamped too",
                        r"-X '?github",
                        "-X main.version=dev ${0}",
                    ),
                ],
            );
        }
    }
}

/// The negative control of `shipped_dockerfile_is_the_only_one`: `deployments/docker` with
/// another Dockerfile, or without one it must hold.
#[test]
fn docker_dir_checks_refuse_mutations() {
    let mut names: Vec<String> = [Some(SHIPPED_DOCKERFILE), candidate(TRANSITION)]
        .into_iter()
        .flatten()
        .map(|path| base_name(path).to_owned())
        .collect();
    assert_no_problems(&docker_dir_problems(TRANSITION, &names));
    let mut extra = names.clone();
    extra.push("Dockerfile.debug".to_owned());
    assert!(
        !docker_dir_problems(TRANSITION, &extra).is_empty(),
        "{SHIPPED_DIR} passes with a Dockerfile.debug in it"
    );
    let dropped = names.pop();
    assert!(
        !docker_dir_problems(TRANSITION, &names).is_empty(),
        "{SHIPPED_DIR} passes without {dropped:?}"
    );
}

/// The negative control of the Makefile half of `other_dockerfiles_are_test_only`: a second
/// image target, or the image built from another Dockerfile.
#[test]
fn makefile_checks_refuse_mutations() {
    assert_refuses(
        MAKEFILE,
        &repo::read(MAKEFILE),
        makefile_target_problems,
        &[
            regex(
                "a second image target",
                r"(?m)^(DOCKER_TARGETS\s*:?=\s*bitgauge)",
                "${1} bitgauge-rust",
            ),
            literal(
                "the image from another Dockerfile",
                format!("DOCKERFILE_bitgauge := {SHIPPED_DOCKERFILE}\n"),
                format!("DOCKERFILE_bitgauge := {SHIPPED_DOCKERFILE}.rust\n"),
            ),
        ],
    );
}

/// The negative control of the Dockerfile half of `other_dockerfiles_are_test_only`: a test
/// Dockerfile with a base unpinned or unreadable, or one the Makefile builds.
#[test]
fn test_image_checks_refuse_mutations() {
    let referrers = referrers();
    let fixture = "test/image/fixture/probe.Dockerfile";
    let pinned =
        format!("FROM dhi.io/static:20250419 AS one\nFROM docker.io/library/alpine:3.23{DIGEST}\n");
    assert_refuses(
        fixture,
        &pinned,
        |text| test_image_problems(fixture, text, &referrers),
        &[
            literal(
                "a dhi.io base by digest",
                "20250419",
                format!("20250419{DIGEST}"),
            ),
            literal("another base by tag alone", DIGEST, ""),
            literal("a variable base", "dhi.io/static:20250419", "$BASE"),
            regex("an unreadable file", r"\A", "RUN true\n"),
        ],
    );
    let mut building = referrers.clone();
    if let Some(makefile) = building.get_mut(MAKEFILE) {
        makefile.push_str("probe: ; docker build -f ");
        makefile.push_str(fixture);
        makefile.push_str(" .\n");
    }
    assert!(
        !test_image_problems(fixture, &pinned, &building).is_empty(),
        "a test Dockerfile the Makefile builds passes"
    );
}

/// The negative control of `rust_candidate_is_test_only`: each workflow with the candidate
/// named in it.
#[test]
fn candidate_workflow_checks_refuse_mutations() {
    if let Some(candidate) = candidate(TRANSITION) {
        for workflow in workflows() {
            assert_refuses(
                &workflow,
                &repo::read(&workflow),
                |text| candidate_workflow_problems(&workflow, text, candidate),
                &[regex(
                    "the candidate named",
                    r"\A",
                    format!("# builds {candidate}\n"),
                )],
            );
        }
    }
}

/// The negative control of `platforms`: release.yaml with a third platform, one platform, or
/// arm/v7 named beside a reference.
#[test]
fn platform_checks_refuse_mutations() {
    let declared = format!("PLATFORMS: {WANT_PLATFORMS}");
    assert_refuses(
        RELEASE_WORKFLOW,
        &repo::read(RELEASE_WORKFLOW),
        |text| platform_problems(RELEASE_WORKFLOW, text),
        &[
            literal(
                "a third platform",
                declared.as_str(),
                format!("{declared},linux/riscv64"),
            ),
            literal(
                "one platform",
                declared.as_str(),
                "PLATFORMS: \"linux/amd64\"",
            ),
            literal(
                "arm/v7 named",
                declared.as_str(),
                "PLATFORMS: ${{ env.X }} # linux/arm/v7",
            ),
        ],
    );
}

/// The Rust Dockerfile's build stage: FROM `dhi.io/rust:<channel>-debian13-dev`, the channel
/// being rust-toolchain.toml's, on the build platform; zig, cargo-zigbuild and the musl rust-std
/// downloaded at the releases `.mk/rust-release.mk` pins and checked against exactly its sha256
/// values, the rust-std release being the image's own toolchain; and the binary built by
/// cargo-zigbuild with `BITGAUGE_VERSION`, `BITGAUGE_COMMIT` and `BITGAUGE_DATE` set from the
/// VERSION, COMMIT and DATE build arguments.
#[test]
fn rust_build_stage() {
    let path = rust_dockerfile(TRANSITION);
    assert_no_problems(&images::rust_build_problems(
        path,
        &repo::read(path),
        &rust_pins(),
    ));
}

/// The negative control of `rust_build_stage`: the Rust Dockerfile broken one way at a time.
#[test]
fn rust_build_checks_refuse_mutations() {
    let path = rust_dockerfile(TRANSITION);
    let pins = rust_pins();
    let channel = regex::escape(&pins.channel);
    let tag = format!(r"dhi\.io/rust:{channel}-debian13-dev");
    assert_refuses(
        path,
        &repo::read(path),
        |text| images::rust_build_problems(path, text, &pins),
        &[
            regex(
                "a rust tag off the channel",
                tag.as_str(),
                format!("dhi.io/rust:{}.0-debian13-dev", pins.channel),
            ),
            regex(
                "the alpine variant",
                tag.as_str(),
                format!("dhi.io/rust:{}-alpine3.23-dev", pins.channel),
            ),
            regex(
                "a rust-std off the image's toolchain",
                format!(r"ARG RUST_VERSION={channel}\b"),
                "ARG RUST_VERSION=1.0.0",
            ),
            regex(
                "the build stage emulated",
                r"--platform=\$BUILDPLATFORM (dhi\.io/rust)",
                "${1}",
            ),
            regex(
                "a changed rust-std sha256",
                r"std_sha256=[0-9a-f]",
                "std_sha256=x",
            ),
            regex(
                "a changed aarch64 rust-std sha256",
                r"(aarch64-unknown-linux-musl; std_sha256=)[0-9a-f]",
                "${1}x",
            ),
            regex(
                "a changed cargo-zigbuild sha256",
                r"zigbuild_sha256=[0-9a-f]",
                "zigbuild_sha256=x",
            ),
            regex(
                "a changed zig sha256",
                r"zig_sha256=[0-9a-f]",
                "zig_sha256=x",
            ),
            regex(
                "a third rust-std target",
                r#"(\*\) echo "no Rust target)"#,
                "riscv64) triple=riscv64gc-unknown-linux-musl; std_sha256=00 ;; ${1}",
            ),
            regex(
                "another zig release",
                r"ARG ZIG_VERSION=\S+",
                "ARG ZIG_VERSION=0.0.1",
            ),
            regex(
                "another cargo-zigbuild release",
                r"ARG CARGO_ZIGBUILD_VERSION=\S+",
                "ARG CARGO_ZIGBUILD_VERSION=0.0.1",
            ),
            literal(
                "rust-std from elsewhere",
                "https://static.rust-lang.org/dist/",
                "https://example.com/dist/",
            ),
            literal(
                "zig unchecked",
                r#"echo "${zig_sha256}  /tmp/zig.tar.xz" | sha256sum -c -"#,
                "true",
            ),
            regex(
                "rust-std unchecked",
                r#"(?m)^\s*&& echo "\$\{std_sha256\}.*\n"#,
                "",
            ),
            literal(
                "zig for the target platform",
                r#"case "${BUILDARCH}" in"#,
                r#"case "${TARGETARCH}" in"#,
            ),
            literal("a missing stamp", r#"BITGAUGE_COMMIT="${COMMIT}""#, ""),
            literal(
                "a stamp from the wrong argument",
                r#"BITGAUGE_DATE="${DATE}""#,
                r#"BITGAUGE_DATE="${COMMIT}""#,
            ),
            literal("an undeclared stamp argument", "ARG DATE=\"unknown\"\n", ""),
            literal("an unlocked build", "--release --locked", "--release"),
            literal(
                "the binary left in target",
                r#"cp "target/${triple}/release/bitgauge" /out/bitgauge"#,
                "true",
            ),
        ],
    );
}

/// The Rust Dockerfile's web and runtime stages are the shipped Dockerfile's, instruction for
/// instruction, so the two images differ only in how the binary is built: the same labels, user,
/// healthcheck, binary path and entrypoint. After the cutover the two are one file.
#[test]
fn rust_dockerfile_shares_web_and_runtime_stages() {
    let rust = rust_dockerfile(TRANSITION);
    assert_no_problems(&images::shared_stage_problems(
        SHIPPED_DOCKERFILE,
        &repo::read(SHIPPED_DOCKERFILE),
        rust,
        &repo::read(rust),
    ));
}

/// The negative control of `rust_dockerfile_shares_web_and_runtime_stages`: a Rust Dockerfile
/// whose web or runtime stage differs from the shipped one's by one instruction or its base.
#[test]
fn shared_stage_checks_refuse_mutations() {
    let rust = rust_dockerfile(TRANSITION);
    let shipped = repo::read(SHIPPED_DOCKERFILE);
    assert_refuses(
        rust,
        &repo::read(rust),
        |text| images::shared_stage_problems(SHIPPED_DOCKERFILE, &shipped, rust, text),
        &[
            literal(
                "another runtime user",
                "USER 65532:65532",
                "USER 65532:65533",
            ),
            literal(
                "an extra runtime instruction",
                "EXPOSE 8080",
                "EXPOSE 8080\nSTOPSIGNAL SIGINT",
            ),
            literal("a runtime instruction dropped", "EXPOSE 8080\n", ""),
            literal(
                "another runtime base",
                "FROM dhi.io/static:20250419",
                "FROM dhi.io/static:20250101",
            ),
            literal(
                "another label",
                r#"licenses="GPL-3.0-or-later""#,
                r#"licenses="MIT""#,
            ),
            literal(
                "another web install",
                "npm ci --no-audit --no-fund",
                "npm ci --no-fund",
            ),
            literal(
                "the web stage emulated",
                "--platform=$BUILDPLATFORM dhi.io/node",
                "dhi.io/node",
            ),
            literal("no runtime stage", " AS runtime", " AS final"),
        ],
    );
}
