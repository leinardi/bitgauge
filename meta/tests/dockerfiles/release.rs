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

//! The rules `release.yaml` must keep (docs/release.md, build-packaging.md sections 2, 4 and 6):
//! the binaries carry the version stamps, the image is built once for exactly the two platforms,
//! GHCR is the only registry anything is pushed to and `ghcr.io/leinardi/bitgauge` the only
//! image there, and the tools, actions and images it runs are pinned. Each rule is a function of
//! the text, so the negative control can run it on a mutated copy.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;
use serde::Deserialize;

use super::reader;

/// The workflow these rules read.
pub const RELEASE_WORKFLOW: &str = ".github/workflows/release.yaml";
/// The two release platforms (decisions.md section 27).
pub const WANT_PLATFORMS: &str = "linux/amd64,linux/arm64";
/// The one image release.yaml publishes, on the one registry it publishes to
/// (build-packaging.md section 6).
pub const RELEASE_IMAGE: &str = "ghcr.io/leinardi/bitgauge";
// The actions whose inputs decide where the release pushes.
const LOGIN_ACTION: &str = "docker/login-action";
const BUILD_PUSH_ACTION: &str = "docker/build-push-action";
const ATTEST_ACTION: &str = "actions/attest-build-provenance";

/// The part of release.yaml the rules read. A scalar the workflow writes unquoted (`true`, `5`)
/// reads as its text, as Go's YAML decoder gives it to a string field.
#[derive(Debug, Default, Deserialize)]
struct ReleaseDoc {
    #[serde(default)]
    env: BTreeMap<String, String>,
    /// Ordered by job name, the order the rules walk the steps in.
    #[serde(default)]
    jobs: BTreeMap<String, ReleaseJob>,
}

#[derive(Debug, Default, Deserialize)]
struct ReleaseJob {
    #[serde(default)]
    steps: Vec<ReleaseStep>,
}

#[derive(Debug, Default, Deserialize)]
struct ReleaseStep {
    #[serde(default)]
    with: BTreeMap<String, String>,
    #[serde(default)]
    uses: String,
    #[serde(default)]
    run: String,
}

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

static ENV_REFERENCE: LazyLock<Regex> = LazyLock::new(|| pattern(r"\$\{\{\s*env\.(\w+)\s*\}\}"));

impl ReleaseDoc {
    /// The steps of every job, in job name order.
    fn steps(&self) -> impl Iterator<Item = &ReleaseStep> {
        self.jobs.values().flat_map(|job| job.steps.iter())
    }

    fn env(&self, name: &str) -> &str {
        self.env.get(name).map_or("", String::as_str)
    }

    /// `value` with each `${{ env.NAME }}` replaced by the workflow's env value.
    fn expand(&self, value: &str) -> String {
        ENV_REFERENCE
            .replace_all(value, |found: &regex::Captures<'_>| {
                self.env(found.get(1).map_or("", |name| name.as_str()))
                    .to_owned()
            })
            .into_owned()
    }
}

impl ReleaseStep {
    /// The `uses:` value without its `@ref`.
    fn action(&self) -> &str {
        self.uses
            .split_once('@')
            .map_or(self.uses.as_str(), |(action, _)| action)
    }

    fn with(&self, key: &str) -> &str {
        self.with.get(key).map_or("", String::as_str)
    }
}

/// The make variables the release passes to `make rust-release-binaries`, which
/// [`make_stamp_problems`] holds the make side to turn into the build's `BITGAUGE_*` stamps.
pub const STAMP_VARIABLES: [(&str, &str); 3] = [
    ("GIT_VERSION", "BITGAUGE_VERSION"),
    ("GIT_COMMIT", "BITGAUGE_COMMIT"),
    ("BUILD_DATE", "BITGAUGE_DATE"),
];

static RELEASE_BINARIES: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^\s*make rust-release-binaries\b(.*)$"));

/// The binaries carry the release's version stamps: release.yaml builds them with one
/// `make rust-release-binaries` that passes every [`STAMP_VARIABLES`] make variable, and no Go
/// link-time stamp, which would set nothing.
fn stamp_problems(content: &str) -> Vec<String> {
    let builds: Vec<&str> = RELEASE_BINARIES
        .captures_iter(content)
        .filter_map(|found| found.get(1).map(|arguments| arguments.as_str()))
        .collect();
    let mut problems = Vec::new();
    let [arguments] = builds.as_slice() else {
        return vec![format!(
            "{RELEASE_WORKFLOW} runs make rust-release-binaries {} times, want once",
            builds.len()
        )];
    };
    for (variable, _) in STAMP_VARIABLES {
        if !pattern(&format!(r"(?:^|\s){variable}=\S")).is_match(arguments) {
            problems.push(format!(
                "{RELEASE_WORKFLOW}: make rust-release-binaries is not given {variable}"
            ));
        }
    }
    if content.contains("buildinfo") || content.contains("-ldflags") {
        problems.push(format!(
            "{RELEASE_WORKFLOW} stamps the Go way, which the Rust build does not read"
        ));
    }
    problems
}

static VERSION_ENV: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^RUST_VERSION_ENV\s*=(.*\\\n(?:.*\\\n)*.*)$"));
static STAMP_PREFIX: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^RUST_STAMP_PREFIX\s*:?=\s*(\S+)\s*$"));

/// The make side of the stamps: the `Makefile` names the stamps' prefix (`RUST_STAMP_PREFIX`, the
/// `BITGAUGE` of [`STAMP_VARIABLES`]), make-common's `.mk/rust.mk` sets `<prefix>_VERSION`,
/// `_COMMIT` and `_DATE` from their [`STAMP_VARIABLES`] make variables in `RUST_VERSION_ENV`, and
/// `.mk/rust-release.mk`'s static build, the one `rust-release-binaries` runs, carries it.
pub fn make_stamp_problems(makefile: &str, rust_mk: &str, release_mk: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let mut prefixes = STAMP_VARIABLES
        .iter()
        .filter_map(|(_, stamp)| stamp.rsplit_once('_').map(|(prefix, _)| prefix));
    let want_prefix = prefixes.next().unwrap_or_default();
    match STAMP_PREFIX
        .captures(makefile)
        .and_then(|found| found.get(1))
    {
        Some(prefix) if prefix.as_str() == want_prefix => {}
        Some(prefix) => problems.push(format!(
            "Makefile: RUST_STAMP_PREFIX is {}, not {want_prefix}",
            prefix.as_str()
        )),
        None => problems.push("Makefile sets no RUST_STAMP_PREFIX".to_owned()),
    }
    match VERSION_ENV.captures(rust_mk).and_then(|found| found.get(1)) {
        Some(assignments) => {
            for (variable, stamp) in STAMP_VARIABLES {
                let suffix = stamp.rsplit_once('_').map_or(stamp, |(_, suffix)| suffix);
                let want = format!(r#"$(RUST_STAMP_PREFIX)_{suffix}="$({variable})""#);
                if !assignments.as_str().contains(&want) {
                    problems.push(format!(".mk/rust.mk: RUST_VERSION_ENV does not set {want}"));
                }
            }
        }
        None => problems.push(".mk/rust.mk defines no RUST_VERSION_ENV".to_owned()),
    }
    let carries = release_mk
        .lines()
        .skip_while(|line| !line.starts_with("rust_static_build ="))
        .take_while(|line| !line.trim().is_empty())
        .any(|line| line.contains("$(RUST_VERSION_ENV)"));
    if !carries {
        problems.push(
            ".mk/rust-release.mk: rust_static_build does not carry RUST_VERSION_ENV".to_owned(),
        );
    }
    problems
}

/// Every way release.yaml `content` breaks the release rules. A parse error is the only problem
/// when the text is not YAML, and it starts with "parse ".
pub fn release_problems(content: &str) -> Vec<String> {
    let doc: ReleaseDoc = match serde_saphyr::from_str(content) {
        Ok(doc) => doc,
        Err(error) => return vec![format!("parse {RELEASE_WORKFLOW}: {error}")],
    };
    let mut problems = stamp_problems(content);
    problems.extend(platform_problems(&doc, content));
    problems.extend(reference_problems(&doc, content));
    problems.extend(step_problems(&doc));
    problems.extend(run_problems(&doc));
    problems.extend(pin_problems(&doc, content));
    problems
}

/// One image build, for exactly the two platforms PLATFORMS declares.
fn platform_problems(doc: &ReleaseDoc, content: &str) -> Vec<String> {
    let mut problems = Vec::new();
    if doc.env("PLATFORMS") != WANT_PLATFORMS {
        problems.push(format!(
            "{RELEASE_WORKFLOW} declares PLATFORMS {:?}, want {WANT_PLATFORMS:?}",
            doc.env("PLATFORMS")
        ));
    }
    let mut builds = 0;
    for step in doc.steps() {
        if step.action() != BUILD_PUSH_ACTION {
            continue;
        }
        builds += 1;
        let platforms = doc.expand(step.with("platforms"));
        if platforms != WANT_PLATFORMS {
            problems.push(format!(
                "{RELEASE_WORKFLOW} builds the image for {platforms:?}, want {WANT_PLATFORMS:?}"
            ));
        }
    }
    if builds != 1 {
        problems.push(format!(
            "{RELEASE_WORKFLOW} builds the image {builds} times, want once"
        ));
    }
    if content.contains("linux/arm/v") || content.contains("linux/386") {
        problems.push(format!(
            "{RELEASE_WORKFLOW} names a platform other than {WANT_PLATFORMS}"
        ));
    }
    problems
}

static GHCR_REFERENCE: LazyLock<Regex> = LazyLock::new(|| pattern(r"ghcr\.io/[\w./-]+"));
static OTHER_REGISTRY: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?i)docker\.io|hub\.docker\.com|docker push|docker\.pkg\.github\.com")
});

/// The image is `ghcr.io/leinardi/bitgauge`, no other GHCR image is named, and nothing names
/// Docker Hub or pushes with docker push.
fn reference_problems(doc: &ReleaseDoc, content: &str) -> Vec<String> {
    let mut problems = Vec::new();
    if doc.env("IMAGE") != RELEASE_IMAGE {
        problems.push(format!(
            "{RELEASE_WORKFLOW} publishes IMAGE {:?}, want {RELEASE_IMAGE:?}",
            doc.env("IMAGE")
        ));
    }
    for reference in GHCR_REFERENCE.find_iter(content) {
        if reference.as_str() != RELEASE_IMAGE {
            problems.push(format!(
                "{RELEASE_WORKFLOW} names the GHCR image {}, want only {RELEASE_IMAGE}",
                reference.as_str()
            ));
        }
    }
    for mention in OTHER_REGISTRY.find_iter(content) {
        problems.push(format!(
            "{RELEASE_WORKFLOW} names {:?}; GHCR is the only registry published",
            mention.as_str()
        ));
    }
    for name in ["LOCAL_IMAGE", "COPY_IMAGE"] {
        if !doc.env(name).starts_with("localhost:") {
            problems.push(format!(
                "{RELEASE_WORKFLOW} sets {name} {:?}, not a job-local registry",
                doc.env(name)
            ));
        }
    }
    problems
}

static OUTPUT_NAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?:^|,)name=([^,]+)"));

/// The actions that can push do so only where they may. A login is to GHCR or to dhi.io, the
/// pull-only source of the build stages; the image build pushes only to the job-local registry,
/// by digest; a pushed attestation is on the GHCR image.
fn step_problems(doc: &ReleaseDoc) -> Vec<String> {
    let mut problems = Vec::new();
    for step in doc.steps() {
        match step.action() {
            LOGIN_ACTION => {
                let registry = step.with("registry");
                if registry != "ghcr.io" && registry != "dhi.io" {
                    problems.push(format!(
                        "{RELEASE_WORKFLOW} logs in to {registry:?}, want ghcr.io or dhi.io"
                    ));
                }
            }
            BUILD_PUSH_ACTION => {
                if step.with("push") == "true" || !step.with("tags").is_empty() {
                    problems.push(format!(
                        "{RELEASE_WORKFLOW} builds the image with the push or tags input; it \
                         pushes only by digest"
                    ));
                }
                let outputs = doc.expand(step.with("outputs"));
                let names: Vec<&str> = OUTPUT_NAME
                    .captures_iter(&outputs)
                    .filter_map(|found| found.get(1).map(|name| name.as_str()))
                    .collect();
                for name in &names {
                    if !name.starts_with("localhost:") {
                        problems.push(format!(
                            "{RELEASE_WORKFLOW} builds the image into {name}, not the job-local \
                             registry"
                        ));
                    }
                }
                if names.is_empty() {
                    problems.push(format!(
                        "{RELEASE_WORKFLOW} builds the image into no named registry"
                    ));
                }
            }
            ATTEST_ACTION => {
                let subject = doc.expand(step.with("subject-name"));
                if step.with("push-to-registry") == "true" && subject != RELEASE_IMAGE {
                    problems.push(format!(
                        "{RELEASE_WORKFLOW} pushes an attestation to {subject:?}, want \
                         {RELEASE_IMAGE}"
                    ));
                }
            }
            _ => {}
        }
    }
    problems
}

static POINTER_TARGET: LazyLock<Regex> = LazyLock::new(|| pattern(r"\s-t\s+(\S+)"));
static COPY_TARGET: LazyLock<Regex> = LazyLock::new(|| pattern(r"docker://(\S+)"));
static SIGN_TARGET: LazyLock<Regex> = LazyLock::new(|| pattern(r"cosign sign\b.*\s(\S+)\s*$"));
const ALLOWED_COPY: [&str; 3] = ["$IMAGE@", "$LOCAL_IMAGE@", "$COPY_IMAGE@"];

/// In the scripts, every image tag is set on `$IMAGE`, every skopeo reference is `$IMAGE` or a
/// job-local registry, and cosign signs `$IMAGE`.
fn run_problems(doc: &ReleaseDoc) -> Vec<String> {
    let mut problems = Vec::new();
    for step in doc.steps() {
        for line in step.run.split('\n') {
            if line.contains("imagetools create") {
                for target in POINTER_TARGET.captures_iter(line) {
                    let target = target.get(1).map_or("", |found| found.as_str());
                    if !target.starts_with("\"$IMAGE:") {
                        problems.push(format!("{RELEASE_WORKFLOW} tags {target}, not $IMAGE"));
                    }
                }
            }
            for target in COPY_TARGET.captures_iter(line) {
                let target = target.get(1).map_or("", |found| found.as_str());
                if !ALLOWED_COPY.iter().any(|prefix| target.starts_with(prefix)) {
                    problems.push(format!(
                        "{RELEASE_WORKFLOW} copies to or from docker://{target}"
                    ));
                }
            }
            if let Some(target) = SIGN_TARGET.captures(line).and_then(|found| found.get(1))
                && !target.as_str().starts_with("\"$IMAGE@")
            {
                problems.push(format!(
                    "{RELEASE_WORKFLOW} signs {}, not $IMAGE",
                    target.as_str()
                ));
            }
        }
    }
    problems
}

static USES_LINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^[ \t]*(?:-[ \t]*)?uses:[ \t]*(\S+)(.*)$"));
static PINNED_ACTION: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$"));
static VERSION_COMMENT: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[ \t]+#[ \t]*v\d+(?:\.\d+)*[ \t]*$"));
/// The actions that publish no version tags, only branches, so their commit is named by the
/// branch it was taken from: dtolnay/rust-toolchain, whose toolchain is its `toolchain` input
/// (pinned by `meta/tests/toolchain.rs`).
const BRANCH_PINNED_ACTIONS: [&str; 1] = ["dtolnay/rust-toolchain"];
static BRANCH_COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[ \t]+#[ \t]*master[ \t]*$"));
static EXACT_VERSION: LazyLock<Regex> = LazyLock::new(|| pattern(r"^v\d+\.\d+\.\d+$"));

/// svu and Trivy at exact versions, the images the job runs pinned by digest, and every action
/// pinned by a full commit SHA with its version in a trailing comment.
fn pin_problems(doc: &ReleaseDoc, content: &str) -> Vec<String> {
    let mut problems = Vec::new();
    for name in ["SVU_VERSION", "TRIVY_VERSION"] {
        if !EXACT_VERSION.is_match(doc.env(name)) {
            problems.push(format!(
                "{RELEASE_WORKFLOW} sets {name} {:?}, want an exact vX.Y.Z",
                doc.env(name)
            ));
        }
    }
    for name in ["REGISTRY_IMAGE", "SKOPEO_IMAGE"] {
        if !reader::digest_pinned(doc.env(name)) {
            problems.push(format!(
                "{RELEASE_WORKFLOW} runs {name} {:?}, which is not pinned by digest",
                doc.env(name)
            ));
        }
    }
    let mut uses = 0;
    for found in USES_LINE.captures_iter(content) {
        uses += 1;
        let action = found.get(1).map_or("", |action| action.as_str());
        let rest = found.get(2).map_or("", |rest| rest.as_str());
        if action.starts_with("./") {
            continue;
        }
        let branch_pinned = BRANCH_PINNED_ACTIONS.iter().any(|name| {
            action
                .split_once('@')
                .is_some_and(|(base, _)| base == *name)
        });
        let commented =
            VERSION_COMMENT.is_match(rest) || (branch_pinned && BRANCH_COMMENT.is_match(rest));
        if !PINNED_ACTION.is_match(action) || !commented {
            problems.push(format!(
                "{RELEASE_WORKFLOW} uses {action}{rest}; want a full commit SHA and a trailing \
                 # vX.Y.Z comment (# master for {})",
                BRANCH_PINNED_ACTIONS.join(", ")
            ));
        }
    }
    if uses == 0 {
        problems.push(format!(
            "{RELEASE_WORKFLOW} uses no action, so the pin check saw nothing"
        ));
    }
    problems
}
