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
//! The shipped Dockerfile is the Rust build; the Go build and the Rust candidate it replaced are
//! gone (`docs/rust-port.md`). The Dockerfile reader and the generic image rules are
//! rust-common's `repo_meta::dockerfile` and `repo_meta::image`, with BitGauge's parameters
//! (`dockerfiles/images.rs`); what `deployments/docker` holds, the test images, the Makefile's
//! image target and the release workflow's rules are BitGauge's own. Every check is a function of
//! the text, and each is also run on input built to break it.

#[path = "dockerfiles/images.rs"]
mod images;
#[path = "dockerfiles/release.rs"]
mod release;

use std::collections::BTreeMap;
use std::fs;
use std::sync::LazyLock;

use meta::SHIPPED_DOCKERFILE;
use regex::Regex;
use repo_meta::dockerfile;
use repo_meta::image;

use images::{BuildFiles, MAKEFILE, RUST_MK, RUST_RELEASE_MK};
use release::{RELEASE_IMAGE, RELEASE_WORKFLOW, WANT_PLATFORMS};

const SHIPPED_DIR: &str = "deployments/docker";
const WORKFLOWS_DIR: &str = ".github/workflows";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

fn base_name(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, name)| name)
}

/// Every Dockerfile in the repository, tracked or new (`Dockerfile`, `<name>.Dockerfile` and
/// `Dockerfile.<name>`, but not the `Dockerfile.<name>.dockerignore` `BuildKit` reads beside one).
/// Asking git rather than walking keeps the ignored trees (`target/`, `node_modules/`, `dist/`)
/// out without naming them.
fn all_dockerfiles() -> Vec<String> {
    let found = image::dockerfiles(&meta::repo());
    assert!(
        found.iter().any(|path| path == SHIPPED_DOCKERFILE),
        "the search did not find {SHIPPED_DOCKERFILE}, so it would find nothing else either"
    );
    found
}

/// The workflow files directly under `.github/workflows`.
fn workflows() -> Vec<String> {
    meta::repo()
        .files_under(WORKFLOWS_DIR, &[".yaml", ".yml"])
        .into_iter()
        .filter(|path| {
            path.strip_prefix(WORKFLOWS_DIR)
                .is_some_and(|rest| rest.matches('/').count() == 1)
        })
        .collect()
}

fn build_files() -> BuildFiles {
    BuildFiles::read(&meta::repo())
}

/// What `deployments/docker` may hold: the shipped Dockerfile alone. `names` are the Dockerfiles
/// found there.
fn docker_dir_problems(names: &[String]) -> Vec<String> {
    let want = [base_name(SHIPPED_DOCKERFILE)];
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
    repo_meta::strings(&image::syntax_problems(path, content, required))
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
    match dockerfile::parse(content) {
        Ok(stages) => {
            for stage in stages {
                if !dockerfile::base_pinned(&stage.image) {
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

/// The platforms an image may be built for (decisions.md section 27): dhi.io/static has no
/// arm/v7.
const FORBIDDEN_PLATFORMS: [&str; 2] = ["linux/arm/v", "linux/386"];

/// The two platforms wherever `workflows` (path and text) name platforms, and a literal
/// declaration in release.yaml, which the image is built for.
fn platform_problems(workflows: &[(String, String)]) -> Vec<String> {
    repo_meta::strings(&image::platform_problems(
        workflows,
        RELEASE_WORKFLOW,
        WANT_PLATFORMS,
        &FORBIDDEN_PLATFORMS,
    ))
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
/// ships. Any other file there would look shipped to every reader and be built by nothing.
#[test]
fn shipped_dockerfile_is_the_only_one() {
    let names: Vec<String> = fs::read_dir(meta::repo().path(SHIPPED_DIR))
        .unwrap_or_else(|error| panic!("read {SHIPPED_DIR}: {error}"))
        .map(|entry| {
            entry
                .unwrap_or_else(|error| panic!("read {SHIPPED_DIR}: {error}"))
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .filter(|name| image::is_dockerfile_path(name))
        .collect();
    assert_no_problems(&docker_dir_problems(&names));
}

/// Go: `TestSyntaxDirectiveIsPinned`. Each Dockerfile's `BuildKit` frontend, when it names one, is
/// docker/dockerfile pinned by digest (build-packaging.md section 1); the shipped one must name
/// one.
#[test]
fn syntax_directive_is_pinned() {
    let problems: Vec<String> = all_dockerfiles()
        .iter()
        .flat_map(|path| {
            syntax_problems(path, &meta::repo().read(path), path == SHIPPED_DOCKERFILE)
        })
        .collect();
    assert_no_problems(&problems);
}

/// Go: `TestShippedStages`. The three named stages, in order, each from a literal dhi.io base
/// pinned by an explicit tag and no digest.
#[test]
fn shipped_stages() {
    assert_no_problems(&images::layout_problems(
        SHIPPED_DOCKERFILE,
        &meta::repo().read(SHIPPED_DOCKERFILE),
    ));
}

/// Go: `TestBuildStages`. Both build stages run on the build platform, web from dhi.io/node and
/// build from exactly `dhi.io/rust:<release>-debian13-dev`, and neither fetches anything its
/// rules do not name. The other files that write the Rust release are the toolchain pins'
/// (meta/tests/toolchain.rs).
#[test]
fn build_stages() {
    assert_no_problems(&images::build_stage_problems(
        SHIPPED_DOCKERFILE,
        &meta::repo().read(SHIPPED_DOCKERFILE),
        &build_files(),
    ));
}

/// Go: `TestRuntimeStage`. The posture of the image that ships: no shell, nothing to write to,
/// an unprivileged numeric user, the healthcheck in exec form and the seven OCI labels.
#[test]
fn runtime_stage() {
    assert_no_problems(&images::runtime_problems(
        SHIPPED_DOCKERFILE,
        &meta::repo().read(SHIPPED_DOCKERFILE),
    ));
}

/// The Makefile and release.yaml, the files that build and release the product image.
fn referrers() -> BTreeMap<&'static str, String> {
    let repo = meta::repo();
    let mut referrers = BTreeMap::from([(MAKEFILE, repo.read(MAKEFILE))]);
    if repo.path(RELEASE_WORKFLOW).is_file() {
        referrers.insert(RELEASE_WORKFLOW, repo.read(RELEASE_WORKFLOW));
    }
    referrers
}

/// Go: `TestOtherDockerfilesAreTestOnly`. The Makefile builds one image, bitgauge, from the
/// shipped Dockerfile, and every other Dockerfile follows the shipped one's pinning rule and is
/// never built or released as a product image.
#[test]
fn other_dockerfiles_are_test_only() {
    let mut problems = makefile_target_problems(&meta::repo().read(MAKEFILE));
    let referrers = referrers();
    for path in all_dockerfiles() {
        if path != SHIPPED_DOCKERFILE {
            problems.extend(test_image_problems(
                &path,
                &meta::repo().read(&path),
                &referrers,
            ));
        }
    }
    assert_no_problems(&problems);
}

/// Go: `TestPlatforms`. Every workflow that names platforms names exactly linux/amd64 and
/// linux/arm64 (decisions.md section 27).
#[test]
fn platforms() {
    let workflows = workflows();
    assert!(
        workflows
            .iter()
            .any(|workflow| workflow == RELEASE_WORKFLOW),
        "the scan did not see {RELEASE_WORKFLOW}: {workflows:?}"
    );
    assert_no_problems(&platform_problems(&meta::repo().read_all(&workflows)));
}

/// Go: `TestReleaseWorkflow`. What release.yaml publishes and how (docs/release.md,
/// build-packaging.md sections 2, 4 and 6): the binaries carry the version stamps of the build
/// that ships, the image is built for exactly the two platforms, GHCR is the only registry
/// anything is pushed to and ghcr.io/leinardi/bitgauge the only image there, and the tools,
/// actions and images it runs are pinned.
#[test]
fn release_workflow() {
    assert_no_problems(&release::release_problems(
        &meta::repo().read(RELEASE_WORKFLOW),
    ));
}

/// The mutations of `release_checks_refuse_mutations`, one broken rule each.
fn release_mutations() -> Vec<Mutation> {
    vec![
        literal(
            "the commit not passed to the build",
            r#"GIT_COMMIT="${COMMIT}""#,
            r#"COMMIT="${COMMIT}""#,
        ),
        literal(
            "the binaries built without the stamps",
            "make rust-release-binaries GIT_VERSION=",
            "make rust-release-binaries VERSION=",
        ),
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
            "another action by its branch",
            r"(uses: actions/checkout@[0-9a-f]{40}) # v[\d.]+",
            "${1} # master",
        ),
        regex(
            "the branch-pinned action by tag",
            r"uses: dtolnay/rust-toolchain@[0-9a-f]{40}",
            "uses: dtolnay/rust-toolchain@v1",
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
        let problems = release::release_problems(text);
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
        &meta::repo().read(RELEASE_WORKFLOW),
        check,
        &mutations,
    );
}

/// The make side of the release binaries' stamps: the make variables release.yaml passes reach
/// the static build, `rust-dist` and `rust-run` as `BITGAUGE_VERSION`, `BITGAUGE_COMMIT` and
/// `BITGAUGE_DATE`, which the Rust build reads at compile time (`release_workflow` holds
/// release.yaml to passing them), as the image's build stage sets them in its cargo zigbuild RUN.
#[test]
fn release_binaries_are_stamped() {
    assert_no_problems(&images::stamp_problems(
        SHIPPED_DOCKERFILE,
        &meta::repo().read(SHIPPED_DOCKERFILE),
        &build_files(),
    ));
}

/// The stamp problems of the shipped Dockerfile against `files`.
fn make_stamp_problems(files: &BuildFiles) -> Vec<String> {
    images::stamp_problems(
        SHIPPED_DOCKERFILE,
        &meta::repo().read(SHIPPED_DOCKERFILE),
        files,
    )
}

/// The negative control of `release_binaries_are_stamped`: another stamp prefix or none, one
/// overridden by a later assignment, a stamp set from another variable or dropped, the build
/// recipe or the static build without the stamps, or the version module not reading one.
#[test]
fn make_stamp_checks_refuse_mutations() {
    let files = build_files();
    let with = |change: &dyn Fn(&mut BuildFiles, &str), text: &str| {
        let mut changed = files.clone();
        change(&mut changed, text);
        make_stamp_problems(&changed)
    };
    let makefile = |files: &mut BuildFiles, text: &str| text.clone_into(&mut files.makefile);
    let rust_mk = |files: &mut BuildFiles, text: &str| text.clone_into(&mut files.rust_mk);
    let release_mk = |files: &mut BuildFiles, text: &str| text.clone_into(&mut files.release_mk);
    let version_rs = |files: &mut BuildFiles, text: &str| text.clone_into(&mut files.version_rs);
    assert_refuses(
        MAKEFILE,
        &files.makefile,
        |text| with(&makefile, text),
        &[
            literal(
                "another prefix",
                "RUST_STAMP_PREFIX := BITGAUGE",
                "RUST_STAMP_PREFIX := OTHER",
            ),
            literal("no prefix", "RUST_STAMP_PREFIX := BITGAUGE", ""),
            literal(
                "the prefix overridden",
                "RUST_STAMP_PREFIX := BITGAUGE\n",
                "RUST_STAMP_PREFIX := BITGAUGE\nRUST_STAMP_PREFIX += X\n",
            ),
        ],
    );
    assert_refuses(
        RUST_MK,
        &files.rust_mk,
        |text| with(&rust_mk, text),
        &[
            literal(
                "the commit from another variable",
                r#"$(RUST_STAMP_PREFIX)_COMMIT="$(GIT_COMMIT)""#,
                r#"$(RUST_STAMP_PREFIX)_COMMIT="$(COMMIT)""#,
            ),
            literal(
                "the date dropped",
                r#"$(RUST_STAMP_PREFIX)_DATE="$(BUILD_DATE)""#,
                "",
            ),
            literal("no stamps at all", "RUST_VERSION_ENV =", "RUST_ENV ="),
            regex(
                "rust-dist unstamped",
                r"(?m)^(rust-dist:.*\n\t)\$\(RUST_VERSION_ENV\) ",
                "${1}",
            ),
            regex(
                "rust-run unstamped",
                r"(?m)^(rust-run:.*\n\t)\$\(RUST_VERSION_ENV\) ",
                "${1}",
            ),
        ],
    );
    assert_refuses(
        "src/buildinfo.rs",
        &files.version_rs,
        |text| with(&version_rs, text),
        &[
            literal(
                "the stamps read under another prefix",
                r#"buildinfo!("BITGAUGE","#,
                r#"buildinfo!("OTHER","#,
            ),
            literal(
                "buildinfo! imported from another crate",
                "use service_kit::{Defaults, EmptyStamp, buildinfo};",
                "use service_kit::{Defaults, EmptyStamp};\nuse other::buildinfo;",
            ),
        ],
    );
    assert_refuses(
        RUST_RELEASE_MK,
        &files.release_mk,
        |text| with(&release_mk, text),
        &[literal(
            "the static build unstamped",
            r#"RUSTFLAGS="$(RUST_RELEASE_RUSTFLAGS)" $(RUST_VERSION_ENV)"#,
            r#"RUSTFLAGS="$(RUST_RELEASE_RUSTFLAGS)""#,
        )],
    );
}

const DIGEST: &str = "@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// The pinning predicates of the reader on references that must pass and must not.
fn assert_reference_rules() {
    for (name, image) in [
        ("a tag only", "dhi.io/static:20250419".to_owned()),
        (
            "a variable tag",
            format!("dhi.io/rust:${{RUST_VERSION}}-debian13-dev{DIGEST}"),
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
            !dockerfile::digest_pinned(&image),
            "{name} ({image:?}) passes as digest-pinned"
        );
    }
    assert!(
        dockerfile::digest_pinned(&format!("dhi.io/static:20250419{DIGEST}")),
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
            "dhi.io/rust:${RUST_VERSION}-debian13-dev".to_owned(),
        ),
        ("a variable image", "$BASE".to_owned()),
        ("an empty tag", "dhi.io/static:".to_owned()),
        ("a stage name, not a ref", "build".to_owned()),
    ] {
        assert!(
            !dockerfile::tag_pinned(&image),
            "{name} ({image:?}) passes as pinned by an explicit tag alone"
        );
    }
    assert!(
        dockerfile::tag_pinned("dhi.io/rust:1.98.1-debian13-dev"),
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
        assert_eq!(
            dockerfile::base_pinned(&image),
            want,
            "base_pinned({image:?})"
        );
    }
}

/// Go: `TestParseRejectsWhatTheAssertionsMustNotMiss`. The negative control for the reader: each
/// of these inputs has to come out as something the assertions refuse, and the inputs that are
/// pinned or well formed as what they are.
#[test]
fn parse_rejects_what_the_assertions_must_not_miss() {
    assert_reference_rules();
    let stages = dockerfile::parse(&format!(
        "FROM a:1{DIGEST} AS one\nRUN echo \\\n  two\n# note\nFROM b:2{DIGEST}\nUSER 1:1\n"
    ))
    .unwrap_or_else(|error| panic!("parse: {error}"));
    assert!(
        matches!(stages.as_slice(), [one, two]
            if one.name == "one" && two.name.is_empty()
                && one.joined() == "RUN echo two" && two.joined() == "USER 1:1"),
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
        let syntax = dockerfile::syntax(&content);
        assert!(
            syntax.is_none(),
            "{name}: read the syntax directive {syntax:?}, which BuildKit ignores"
        );
    }
    let syntax = dockerfile::syntax(&format!(
        "# check=error=true\n#Syntax = docker/dockerfile:1.7{DIGEST}\n"
    ));
    assert_eq!(
        syntax,
        Some(format!("docker/dockerfile:1.7{DIGEST}")),
        "a directive after another directive"
    );

    for (name, content) in [
        (
            "a file ending inside a continuation",
            format!("FROM a:1{DIGEST}\nRUN echo \\\n"),
        ),
        (
            "another escape character",
            format!("# escape=`\nFROM a:1{DIGEST}\nRUN echo `\n  two\n"),
        ),
        (
            "a heredoc",
            format!("FROM a:1{DIGEST}\nRUN <<EOF\nFROM b:2{DIGEST}\nEOF\n"),
        ),
    ] {
        assert!(dockerfile::parse(&content).is_err(), "{name} parsed");
    }
}

/// The negative control of `shipped_stages`: the shipped Dockerfile with a stage unpinned, from
/// another registry, unnamed or renamed.
#[test]
fn layout_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let content = meta::repo().read(path);
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

/// The negative control of `build_stages`: a build stage emulated, from another base, or fetching
/// what its rules do not name.
#[test]
fn build_stage_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let content = meta::repo().read(path);
    let files = build_files();
    assert_refuses(
        path,
        &content,
        |text| images::build_stage_problems(path, text, &files),
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
                r"--platform=\$BUILDPLATFORM (dhi\.io/rust)",
                "${1}",
            ),
            regex(
                "the build stage from another base",
                r"dhi\.io/rust:",
                "dhi.io/gcc:",
            ),
            literal(
                "a fetch in the web stage",
                "RUN npm run build",
                "RUN curl -fsSL -o /tmp/x https://example.com/x && npm run build",
            ),
            literal(
                "an arm labelled by alternatives before the real one",
                "\t\tamd64) triple=",
                "\t\tamd64|x86_64) triple=x86_64-unknown-linux-gnu; std_sha256=${STD_SHA} ;; \\\n\t\tamd64) triple=",
            ),
            literal(
                "an unlisted fetch beside a listed one",
                "curl -fsSL -o /tmp/zig.tar.xz",
                "curl -fsSL -o /tmp/extra https://example.com/extra && curl -fsSL -o /tmp/zig.tar.xz",
            ),
        ],
    );
}

/// The negative control of `runtime_stage`: a runtime stage broken one way at a time.
#[test]
fn runtime_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let content = meta::repo().read(path);
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

/// The negative control of `syntax_directive_is_pinned` on the image Dockerfiles: no
/// directive, one by tag alone, or another frontend.
#[test]
fn syntax_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let content = meta::repo().read(path);
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

/// The negative control of `shipped_dockerfile_is_the_only_one`: `deployments/docker` with
/// another Dockerfile, or without one it must hold.
#[test]
fn docker_dir_checks_refuse_mutations() {
    let mut names = vec![base_name(SHIPPED_DOCKERFILE).to_owned()];
    assert_no_problems(&docker_dir_problems(&names));
    let mut extra = names.clone();
    extra.push("Dockerfile.debug".to_owned());
    assert!(
        !docker_dir_problems(&extra).is_empty(),
        "{SHIPPED_DIR} passes with a Dockerfile.debug in it"
    );
    let dropped = names.pop();
    assert!(
        !docker_dir_problems(&names).is_empty(),
        "{SHIPPED_DIR} passes without {dropped:?}"
    );
}

/// The negative control of the Makefile half of `other_dockerfiles_are_test_only`: a second
/// image target, or the image built from another Dockerfile.
#[test]
fn makefile_checks_refuse_mutations() {
    assert_refuses(
        MAKEFILE,
        &meta::repo().read(MAKEFILE),
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
    let fixture = "testenv/tests/image/testdata/probe.Dockerfile";
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

/// The negative control of `platforms`: release.yaml with a third platform, one platform, or
/// arm/v7 named beside a reference.
#[test]
fn platform_checks_refuse_mutations() {
    let declared = format!("PLATFORMS: {WANT_PLATFORMS}");
    assert_refuses(
        RELEASE_WORKFLOW,
        &meta::repo().read(RELEASE_WORKFLOW),
        |text| platform_problems(&[(RELEASE_WORKFLOW.to_owned(), text.to_owned())]),
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

/// The shipped Dockerfile's build stage: FROM `dhi.io/rust:<channel>-debian13-dev`, the channel
/// being rust-toolchain.toml's, on the build platform; zig, cargo-zigbuild and the musl rust-std
/// downloaded at the releases `.mk/rust-release.mk` pins and checked against exactly its sha256
/// values, the rust-std release being the image's own toolchain; and the binary built by
/// cargo-zigbuild with `BITGAUGE_VERSION`, `BITGAUGE_COMMIT` and `BITGAUGE_DATE` set from the
/// VERSION, COMMIT and DATE build arguments.
#[test]
fn rust_build_stage() {
    let path = SHIPPED_DOCKERFILE;
    assert_no_problems(&images::rust_build_problems(
        path,
        &meta::repo().read(path),
        &build_files(),
    ));
}

/// The negative control of `rust_build_stage`: the shipped Dockerfile broken one way at a time.
#[test]
fn rust_build_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let files = build_files();
    let release = files
        .release()
        .unwrap_or_else(|problem| panic!("{problem}"));
    assert_refuses(
        path,
        &meta::repo().read(path),
        |text| images::rust_build_problems(path, text, &files),
        &rust_build_mutations(&release),
    );
}

/// The mutations of `rust_build_checks_refuse_mutations`, for the Rust release `release`.
fn rust_build_mutations(release: &str) -> Vec<Mutation> {
    let channel = regex::escape(release);
    let tag = format!(r"dhi\.io/rust:{channel}-debian13-dev");
    vec![
        regex(
            "a rust tag off the channel",
            tag.as_str(),
            format!("dhi.io/rust:{release}.0-debian13-dev"),
        ),
        regex(
            "the alpine variant",
            tag.as_str(),
            format!("dhi.io/rust:{release}-alpine3.23-dev"),
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
    ]
}
