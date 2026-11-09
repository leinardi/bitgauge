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

//! The image invariants of build-packaging.md sections 1 and 2, ported from `test/dockerfiles`:
//! the shipped Dockerfile's stages and pinned bases, its two targets on one base stage, the
//! `BuildKit` frontend pin, and which Dockerfiles may be built and by what.
//!
//! The shipped Dockerfile is the Rust build; the Go build and the Rust candidate it replaced are
//! gone (`docs/rust-port.md`). The Dockerfile reader and the generic image rules are
//! rust-common's `repo_meta::dockerfile` and `repo_meta::image`; the test images and the
//! Makefile's image target are BitGauge's own, and so are the stage rules: `repo_meta::image`'s
//! `BasePolicy` knows no internal stages, while two targets here share one base stage (adapted
//! from swarm-scheduler-exporter's `meta/tests/dockerfiles.rs` at 88394aa). Every check is a
//! function of the text, and each is also run on input built to break it. The version stamps and
//! the running image are not asserted here: `scripts/image-test.sh` and the image suite show them.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use meta::SHIPPED_DOCKERFILE;
use regex::Regex;
use repo_meta::dockerfile::{self, Stage};
use repo_meta::image;

/// The Makefile, which builds the product image.
const MAKEFILE: &str = "Makefile";
/// The workflow that releases the product image.
const RELEASE_WORKFLOW: &str = ".github/workflows/release.yaml";
/// The named stages of the image Dockerfile, in order. The last one is the default target, so
/// `runtime` must stay last.
const STAGES: [&str; 6] = ["web", "build", "dist", "base", "prebuilt", "runtime"];
/// The external bases: each stage's dhi.io repository, pinned by an explicit tag alone.
const EXTERNAL: [(&str, &str); 3] = [
    ("web", "dhi.io/node"),
    ("build", "dhi.io/rust"),
    ("base", "dhi.io/static"),
];
/// The internal ones: the `dist` context's placeholder, and the two targets on the one base.
const INTERNAL: [(&str, &str); 3] = [
    ("dist", "scratch"),
    ("prebuilt", "base"),
    ("runtime", "base"),
];
/// What each target puts on the base: the release asset of the target platform, from the `dist`
/// context, or the build stage's binary, both where the entrypoint, the image tests and the
/// release read it.
const BINARIES: [(&str, &str); 2] = [
    (
        "prebuilt",
        "COPY --from=dist --chmod=0755 bitgauge-${TARGETOS}-${TARGETARCH} /bitgauge",
    ),
    ("runtime", "COPY --from=build /out/bitgauge /bitgauge"),
];
/// The base's posture, which both targets inherit.
const ENTRYPOINT: &str = r#"ENTRYPOINT ["/bitgauge"]"#;
const USER: &str = "USER 65532:65532";
const HEALTHCHECK_CMD: &str = r#"CMD ["/bitgauge", "healthcheck"]"#;

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

/// Whether `stage` has the instruction `line`, as [`Stage::joined`] writes it.
fn runs(stage: &Stage, line: &str) -> bool {
    stage.joined().lines().any(|joined| joined == line)
}

/// The stages of an image Dockerfile: exactly [`STAGES`], in order; each external base a literal
/// reference to its dhi.io repository by an explicit tag and no digest (Dependabot updates only
/// literal FROM lines, a missing or latest tag says nothing about what is built, and dhi.io
/// republishes its tags to ship security fixes, which a digest would hold back); each internal
/// stage from its stage; each target's binary copied where the entrypoint reads it; both targets
/// labelled alike (droast checks the default target's labels only); and the user, the health
/// check and the entrypoint set in the base, so both targets run them.
fn layout_problems(path: &str, content: &str) -> Vec<String> {
    let stages = match dockerfile::parse(content) {
        Ok(stages) => stages,
        Err(error) => return vec![format!("{path}: {error}")],
    };
    let named = |name: &str| dockerfile::stage_named(path, &stages, name);
    let mut problems = Vec::new();
    let found: Vec<&str> = stages.iter().map(|stage| stage.name.as_str()).collect();
    if found != STAGES {
        problems.push(format!("{path}: has the stages {found:?}, want {STAGES:?}"));
    }
    for (name, repository) in EXTERNAL {
        match named(name) {
            Ok(stage)
                if dockerfile::tag_pinned(&stage.image)
                    && dockerfile::repository(&stage.image) == repository => {}
            Ok(stage) => problems.push(format!(
                "{path}: stage {name:?} is FROM {:?}, want a literal {repository}:<tag>, with no \
                 digest",
                stage.image
            )),
            Err(problem) => problems.push(problem.to_string()),
        }
    }
    for (name, from) in INTERNAL {
        match named(name) {
            Ok(stage) if stage.image == from => {}
            Ok(stage) => problems.push(format!(
                "{path}: stage {name:?} is FROM {:?}, want FROM {from}",
                stage.image
            )),
            Err(problem) => problems.push(problem.to_string()),
        }
    }
    for (name, copy) in BINARIES {
        match named(name) {
            Ok(stage) if runs(stage, copy) => {}
            Ok(_) => problems.push(format!("{path}: stage {name:?} does not run {copy:?}")),
            Err(problem) => problems.push(problem.to_string()),
        }
    }
    if let (Ok(prebuilt), Ok(runtime)) = (named("prebuilt"), named("runtime")) {
        let (labels, wanted) = (dockerfile::labels(prebuilt), dockerfile::labels(runtime));
        if wanted.is_empty() || labels != wanted {
            problems.push(format!(
                "{path}: the prebuilt target's labels {labels:?} are not the runtime target's \
                 {wanted:?}"
            ));
        }
    }
    match named("base") {
        Ok(stage) => {
            for line in [ENTRYPOINT, USER] {
                if !runs(stage, line) {
                    problems.push(format!("{path}: stage \"base\" does not set {line}"));
                }
            }
            let probes = stage.joined().lines().any(|joined| {
                joined.starts_with("HEALTHCHECK ") && joined.ends_with(HEALTHCHECK_CMD)
            });
            if !probes {
                problems.push(format!(
                    "{path}: stage \"base\" has no HEALTHCHECK that runs {HEALTHCHECK_CMD}"
                ));
            }
        }
        Err(problem) => problems.push(problem.to_string()),
    }
    problems
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

/// Go: `TestShippedStages`. The six named stages, in order, each external one from a literal
/// dhi.io base pinned by an explicit tag and no digest, and the two targets on the one base stage,
/// the prebuilt one with the release asset as its binary.
#[test]
fn shipped_stages() {
    assert_no_problems(&layout_problems(
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

/// The negative control of `shipped_stages`: each edit of the shipped Dockerfile breaks one rule,
/// and exactly one problem comes back.
#[test]
fn layout_checks_refuse_mutations() {
    let path = SHIPPED_DOCKERFILE;
    let content = meta::repo().read(path);
    let base = "dhi.io/static:20250419";
    let build = "dhi.io/rust:1.98.1-debian13-dev";
    let edit = |from: &str, to: &str| {
        assert!(content.contains(from), "{path} does not contain {from:?}");
        content.replacen(from, to, 1)
    };
    assert!(layout_problems(path, &content).is_empty());
    for (name, broken) in [
        ("a base by digest", edit(base, &format!("{base}{DIGEST}"))),
        ("a base by latest", edit(base, "dhi.io/static:latest")),
        ("a base without a tag", edit(base, "dhi.io/static")),
        (
            "a base from another dhi.io repository",
            edit(base, "dhi.io/alpine:3.23"),
        ),
        (
            "a base from Docker Hub",
            edit(base, &format!("docker.io/library/busybox:1.37{DIGEST}")),
        ),
        (
            "a build base by digest",
            edit(build, &format!("{build}{DIGEST}")),
        ),
        (
            "a variable base",
            edit(&format!("FROM {base}"), "FROM $BASE"),
        ),
        (
            "a stage after the default target",
            format!("{content}\nFROM base AS extra\n"),
        ),
        (
            "the prebuilt target on another stage",
            edit("FROM base AS prebuilt", "FROM build AS prebuilt"),
        ),
        (
            "a dist stage that is an image",
            edit("FROM scratch AS dist", &format!("FROM {base} AS dist")),
        ),
        (
            "the prebuilt binary from the build stage",
            edit(
                "COPY --from=dist --chmod=0755 bitgauge-${TARGETOS}-${TARGETARCH}",
                "COPY --from=build --chmod=0755 /out/bitgauge",
            ),
        ),
        (
            "the runtime binary elsewhere",
            edit(
                "COPY --from=build /out/bitgauge /bitgauge",
                "COPY --from=build /out/bitgauge /usr/local/bin/bitgauge",
            ),
        ),
        (
            "a prebuilt label of its own",
            edit(
                "org.opencontainers.image.title=\"bitgauge\"",
                "org.opencontainers.image.title=\"prebuilt\"",
            ),
        ),
        ("root", edit(USER, "USER 0:0")),
        (
            "another health check",
            edit(HEALTHCHECK_CMD, r#"CMD ["/bitgauge", "serve"]"#),
        ),
        ("no entrypoint", edit(ENTRYPOINT, r#"CMD ["/bitgauge"]"#)),
    ] {
        let problems = layout_problems(path, &broken);
        assert_eq!(problems.len(), 1, "{name}: {problems:?}");
    }

    // A renamed default target is three problems: the stage list, and the runtime stage's base and
    // binary, which no stage holds any more.
    let problems = layout_problems(path, &edit(" AS runtime", " AS final"));
    assert_eq!(problems.len(), 3, "a renamed stage: {problems:?}");
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
