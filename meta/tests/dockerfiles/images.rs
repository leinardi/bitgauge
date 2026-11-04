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

//! The image rules of build-packaging.md section 1, each a function from a Dockerfile's text
//! (and the files it must agree with) to the problems found, so a negative control can run it on
//! a mutated copy: the stage layout and base pinning, the build stages, the runtime posture, and
//! the Rust build stage's toolchain pins and version stamps.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

use super::reader::{self, Stage};

/// The unprivileged numeric identity the image runs as.
pub const RUNTIME_USER: &str = "65532:65532";
/// The end of the runtime stage's HEALTHCHECK: the binary's own subcommand, in exec form, since
/// the runtime has no shell.
pub const HEALTHCHECK_COMMAND: &str = r#" CMD ["/bitgauge", "healthcheck"]"#;
/// The base of the Rust build stage.
pub const RUST_BUILD_REPOSITORY: &str = "dhi.io/rust";
/// The variant of the Rust build base: debian, whose upstream toolchain takes the upstream musl
/// standard libraries, where the alpine variant's rustc is Alpine's own build.
const RUST_BUILD_VARIANT: &str = "debian13-dev";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The stage of `stages` named `name`, if there is exactly one.
fn named<'stages>(
    path: &str,
    stages: &'stages [Stage],
    name: &str,
) -> Result<&'stages Stage, String> {
    let mut found = stages.iter().filter(|stage| stage.name == name);
    match (found.next(), found.next()) {
        (Some(stage), None) => Ok(stage),
        (None, _) => Err(format!("{path} has no stage named {name}, want one")),
        (Some(_), Some(_)) => Err(format!("{path} has several stages named {name}, want one")),
    }
}

/// The stages of `content`, or the one problem that it cannot be read.
fn stages(path: &str, content: &str) -> Result<Vec<Stage>, Vec<String>> {
    reader::parse(content).map_err(|error| vec![format!("{path}: {error}")])
}

/// The named stages, in order, of an image Dockerfile: web, build and runtime, each from a
/// literal dhi.io base pinned by an explicit tag and no digest. Dependabot updates only literal
/// FROM lines, a missing or latest tag says nothing about what is built, and dhi.io republishes
/// its tags to ship security fixes, which a digest would hold back.
pub fn layout_problems(path: &str, content: &str) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let mut problems = Vec::new();
    for stage in &stages {
        if !reader::from_dhi(&stage.image) || !reader::tag_pinned(&stage.image) {
            problems.push(format!(
                "{path}: stage {:?} is FROM {:?}, which is not a literal dhi.io reference pinned \
                 by an explicit tag alone",
                stage.name, stage.image
            ));
        }
    }
    let names: Vec<&str> = stages.iter().map(|stage| stage.name.as_str()).collect();
    if names != ["web", "build", "runtime"] {
        problems.push(format!(
            "{path}: the stages are {names:?}, want exactly web, build and runtime, in that order"
        ));
    }
    problems
}

/// Where the build stages run and what they start from: both on the build platform (the SPA is
/// architecture-free, and both toolchains cross-compile), so no emulation is needed; web from
/// dhi.io/node and build from `build_repository`.
pub fn build_stage_problems(path: &str, content: &str, build_repository: &str) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let mut problems = Vec::new();
    for (name, repository) in [("web", "dhi.io/node"), ("build", build_repository)] {
        let stage = match named(path, &stages, name) {
            Ok(stage) => stage,
            Err(problem) => {
                problems.push(problem);
                continue;
            }
        };
        if stage.platform != "$BUILDPLATFORM" {
            problems.push(format!(
                "{path}: stage {name} runs on --platform={:?}, want $BUILDPLATFORM",
                stage.platform
            ));
        }
        let from = reader::repository(&stage.image);
        if from != repository {
            problems.push(format!(
                "{path}: stage {name} is FROM {from}, want {repository}"
            ));
        }
    }
    problems
}

/// The posture of the image that ships (build-packaging.md section 1): no shell to run anything
/// in, nothing to write to, an unprivileged numeric user, the healthcheck in exec form, and
/// exactly the seven OCI labels.
pub fn runtime_problems(path: &str, content: &str) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let runtime = match named(path, &stages, "runtime") {
        Ok(stage) => stage,
        Err(problem) => return vec![problem],
    };
    let mut problems = Vec::new();
    let from = reader::repository(&runtime.image);
    if from != "dhi.io/static" {
        problems.push(format!(
            "{path}: the runtime stage is FROM {from}, want dhi.io/static"
        ));
    }
    if !runtime.platform.is_empty() {
        problems.push(format!(
            "{path}: the runtime stage pins --platform={}; it has to follow the target platform",
            runtime.platform
        ));
    }
    let mut seen: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for instruction in &runtime.instructions {
        if matches!(
            instruction.keyword.as_str(),
            "RUN" | "SHELL" | "VOLUME" | "WORKDIR" | "ADD" | "ENV"
        ) {
            problems.push(format!(
                "{path}: the runtime stage carries {} {}; it has no shell and writes nothing",
                instruction.keyword, instruction.args
            ));
        }
        seen.entry(instruction.keyword.as_str())
            .or_default()
            .push(instruction.args.as_str());
    }
    let healthchecks = seen.get("HEALTHCHECK").cloned().unwrap_or_default();
    if !matches!(healthchecks.as_slice(), [only] if only.ends_with(HEALTHCHECK_COMMAND)) {
        problems.push(format!(
            "{path}: the runtime stage has HEALTHCHECK {healthchecks:?}, want one ending \
             in{HEALTHCHECK_COMMAND}"
        ));
    }
    for (keyword, args) in [
        ("USER", RUNTIME_USER),
        ("EXPOSE", "8080"),
        ("ENTRYPOINT", r#"["/bitgauge"]"#),
        ("COPY", "--from=build /out/bitgauge /bitgauge"),
    ] {
        let found = seen.get(keyword).cloned().unwrap_or_default();
        if found != [args] {
            problems.push(format!(
                "{path}: the runtime stage has {keyword} {found:?}, want exactly {keyword} {args}"
            ));
        }
    }
    problems.extend(label_problems(path, runtime));
    problems
}

fn label_problems(path: &str, runtime: &Stage) -> Vec<String> {
    let labels = reader::labels(runtime);
    let label = |key: &str| labels.get(key).map_or("", String::as_str);
    let description = label("org.opencontainers.image.description");
    let want = [
        ("org.opencontainers.image.title", "bitgauge"),
        ("org.opencontainers.image.description", description),
        (
            "org.opencontainers.image.source",
            "https://github.com/leinardi/bitgauge",
        ),
        ("org.opencontainers.image.version", "${VERSION}"),
        ("org.opencontainers.image.revision", "${COMMIT}"),
        ("org.opencontainers.image.created", "${DATE}"),
        ("org.opencontainers.image.licenses", "GPL-3.0-or-later"),
    ];
    let mut problems = Vec::new();
    if description.is_empty() {
        problems.push(format!(
            "{path}: the runtime stage has no org.opencontainers.image.description"
        ));
    }
    for (key, value) in want {
        if label(key) != value {
            problems.push(format!(
                "{path}: label {key} is {:?}, want {value:?}",
                label(key)
            ));
        }
    }
    if labels.len() != want.len() {
        problems.push(format!(
            "{path}: the runtime stage carries labels {labels:?}, want exactly the seven OCI labels"
        ));
    }
    problems
}

/// The pins the Rust build stage must download by: the toolchain channel of
/// `rust-toolchain.toml`, and the releases and sha256 values of `.mk/rust-release.mk`, which is
/// their one record. Each sha256 map is keyed by the asset name the Dockerfile's case arms use.
#[derive(Debug, Clone)]
pub struct RustPins {
    pub channel: String,
    pub zig_version: String,
    pub zig: BTreeMap<String, String>,
    pub zigbuild_version: String,
    pub zigbuild: BTreeMap<String, String>,
    pub rust_std_version: String,
    pub rust_std: BTreeMap<String, String>,
}

static MK_ASSIGNMENT: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^RUST_RELEASE_([A-Za-z0-9_.-]+)[ \t]*:=[ \t]*(\S+)[ \t]*$"));

/// The pins read from `rust-toolchain.toml` and `.mk/rust-release.mk`.
///
/// # Errors
///
/// A file that does not carry one of the pins, so a check against it would check nothing.
pub fn rust_pins(toolchain: &str, release_mk: &str) -> Result<RustPins, String> {
    let toolchain: toml::Table =
        toml::from_str(toolchain).map_err(|error| format!("parse rust-toolchain.toml: {error}"))?;
    let channel = toolchain
        .get("toolchain")
        .and_then(|table| table.get("channel"))
        .and_then(toml::Value::as_str)
        .ok_or("rust-toolchain.toml has no toolchain.channel")?
        .to_owned();
    let assignments: BTreeMap<&str, &str> = MK_ASSIGNMENT
        .captures_iter(release_mk)
        .filter_map(|found| Some((found.get(1)?.as_str(), found.get(2)?.as_str())))
        .collect();
    let value = |name: &str| {
        assignments
            .get(name)
            .map(|value| (*value).to_owned())
            .ok_or_else(|| format!(".mk/rust-release.mk sets no RUST_RELEASE_{name}"))
    };
    let sums = |prefix: &str| {
        let sums: BTreeMap<String, String> = assignments
            .iter()
            .filter_map(|(name, sum)| {
                Some((name.strip_prefix(prefix)?.to_owned(), (*sum).to_owned()))
            })
            .collect();
        if sums.is_empty() {
            Err(format!(
                ".mk/rust-release.mk sets no RUST_RELEASE_{prefix}<asset>"
            ))
        } else {
            Ok(sums)
        }
    };
    Ok(RustPins {
        channel,
        zig_version: value("ZIG_VERSION")?,
        zig: sums("ZIG_SHA256_")?,
        zigbuild_version: value("CARGO_ZIGBUILD_VERSION")?,
        zigbuild: sums("CARGO_ZIGBUILD_SHA256_")?,
        rust_std_version: value("RUST_STD_VERSION")?,
        rust_std: sums("RUST_STD_SHA256_")?,
    })
}

/// One archive the Rust build stage downloads: the URL its RUN fetches (which names the release
/// through a build argument), the platform argument its case statement switches on, the
/// variables each case arm sets, and the release and sha256 values it must carry.
struct Download<'pins> {
    tool: &'static str,
    url: &'static str,
    platform_arg: &'static str,
    version_arg: &'static str,
    version: &'pins str,
    asset_var: &'static str,
    sha_var: &'static str,
    sums: &'pins BTreeMap<String, String>,
}

fn downloads(pins: &RustPins) -> [Download<'_>; 3] {
    [
        Download {
            tool: "zig",
            url: "https://ziglang.org/download/${ZIG_VERSION}/zig-${zig_arch}-linux-${ZIG_VERSION}.tar.xz",
            platform_arg: "BUILDARCH",
            version_arg: "ZIG_VERSION",
            version: &pins.zig_version,
            asset_var: "zig_arch",
            sha_var: "zig_sha256",
            sums: &pins.zig,
        },
        Download {
            tool: "cargo-zigbuild",
            url: "https://github.com/rust-cross/cargo-zigbuild/releases/download/v${CARGO_ZIGBUILD_VERSION}/cargo-zigbuild-${zigbuild_asset}.tar.xz",
            platform_arg: "BUILDARCH",
            version_arg: "CARGO_ZIGBUILD_VERSION",
            version: &pins.zigbuild_version,
            asset_var: "zigbuild_asset",
            sha_var: "zigbuild_sha256",
            sums: &pins.zigbuild,
        },
        Download {
            tool: "the musl rust-std",
            url: "https://static.rust-lang.org/dist/rust-std-${RUST_VERSION}-${triple}.tar.xz",
            platform_arg: "TARGETARCH",
            version_arg: "RUST_VERSION",
            version: &pins.rust_std_version,
            asset_var: "triple",
            sha_var: "std_sha256",
            sums: &pins.rust_std,
        },
    ]
}

/// The build arguments a stage declares, each with its default, quotes removed; `None` for one
/// declared with no default.
fn stage_args(stage: &Stage) -> BTreeMap<&str, Option<&str>> {
    stage
        .instructions
        .iter()
        .filter(|instruction| instruction.keyword == "ARG")
        .map(|instruction| match instruction.args.split_once('=') {
            Some((name, default)) => (name, Some(default.trim_matches('"'))),
            None => (instruction.args.as_str(), None),
        })
        .collect()
}

/// The RUN instructions of `stage` that contain `needle`.
fn runs_with<'stage>(stage: &'stage Stage, needle: &str) -> Vec<&'stage str> {
    stage
        .instructions
        .iter()
        .filter(|instruction| instruction.keyword == "RUN" && instruction.args.contains(needle))
        .map(|instruction| instruction.args.as_str())
        .collect()
}

/// The Rust build stage: FROM `dhi.io/rust:<channel>-debian13-dev` on the build platform; zig,
/// cargo-zigbuild and the musl rust-std each downloaded at the pinned release and checked against
/// exactly the pinned sha256 values, the rust-std release being the image's own toolchain; and
/// the binary built with cargo-zigbuild for the target, with the version stamps taken from the
/// VERSION, COMMIT and DATE build arguments, into the path the runtime stage copies.
pub fn rust_build_problems(path: &str, content: &str, pins: &RustPins) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let build = match named(path, &stages, "build") {
        Ok(stage) => stage,
        Err(problem) => return vec![problem],
    };
    let mut problems = Vec::new();
    let want_image = format!(
        "{RUST_BUILD_REPOSITORY}:{}-{RUST_BUILD_VARIANT}",
        pins.channel
    );
    if build.image != want_image {
        problems.push(format!(
            "{path}: the build stage is FROM {}, want {want_image} (rust-toolchain.toml's channel)",
            build.image
        ));
    }
    if build.platform != "$BUILDPLATFORM" {
        problems.push(format!(
            "{path}: the build stage runs on --platform={:?}, want $BUILDPLATFORM",
            build.platform
        ));
    }
    let args = stage_args(build);
    if args.get("RUST_VERSION").copied().flatten() != Some(pins.channel.as_str()) {
        problems.push(format!(
            "{path}: the build stage's RUST_VERSION is {:?}, want the image's own toolchain, {}",
            args.get("RUST_VERSION"),
            pins.channel
        ));
    }
    for download in downloads(pins) {
        problems.extend(download_problems(path, build, &args, &download));
    }
    problems.extend(cargo_build_problems(path, build, &args));
    problems
}

fn download_problems(
    path: &str,
    build: &Stage,
    args: &BTreeMap<&str, Option<&str>>,
    download: &Download<'_>,
) -> Vec<String> {
    let tool = download.tool;
    let mut problems = Vec::new();
    let declared = args.get(download.version_arg).copied().flatten();
    if declared != Some(download.version) {
        problems.push(format!(
            "{path}: the build stage sets {} to {declared:?}, want {} for {tool} \
             (.mk/rust-release.mk)",
            download.version_arg, download.version
        ));
    }
    if !args.contains_key(download.platform_arg) {
        problems.push(format!(
            "{path}: the build stage does not declare ARG {}, which {tool} is chosen by",
            download.platform_arg
        ));
    }
    let runs = runs_with(build, download.url);
    let [run] = runs.as_slice() else {
        problems.push(format!(
            "{path}: {} RUN instructions download {tool} from {}, want one",
            runs.len(),
            download.url
        ));
        return problems;
    };
    if !run.starts_with(&format!("case \"${{{}}}\" in ", download.platform_arg)) {
        problems.push(format!(
            "{path}: the RUN that downloads {tool} does not switch on ${}",
            download.platform_arg
        ));
    }
    let arm = pattern(&format!(
        r"\b{}=([^;\s]+);\s*{}=([^;\s]+)",
        download.asset_var, download.sha_var
    ));
    let found: BTreeMap<String, String> = arm
        .captures_iter(run)
        .filter_map(|arm| {
            Some((
                arm.get(1)?.as_str().to_owned(),
                arm.get(2)?.as_str().to_owned(),
            ))
        })
        .collect();
    if &found != download.sums {
        problems.push(format!(
            "{path}: {tool} is checked against {found:?}, want {:?} (.mk/rust-release.mk)",
            download.sums
        ));
    }
    let check = format!("echo \"${{{}}} /tmp/", download.sha_var);
    if !run.contains(&check) || !run.contains("| sha256sum -c -") {
        problems.push(format!(
            "{path}: the RUN that downloads {tool} does not check it with sha256sum -c against \
             ${}",
            download.sha_var
        ));
    }
    problems
}

/// The cargo-zigbuild invocation: release, locked, for the downloaded target, with each version
/// stamp set from its build argument, copied to the path the runtime stage takes.
fn cargo_build_problems(
    path: &str,
    build: &Stage,
    args: &BTreeMap<&str, Option<&str>>,
) -> Vec<String> {
    let runs = runs_with(build, "cargo zigbuild");
    let [run] = runs.as_slice() else {
        return vec![format!(
            "{path}: {} RUN instructions run cargo zigbuild, want one",
            runs.len()
        )];
    };
    let mut problems = Vec::new();
    for part in [
        "cargo zigbuild --release --locked --target \"${triple}\" --bin bitgauge",
        "cp \"target/${triple}/release/bitgauge\" /out/bitgauge",
    ] {
        if !run.contains(part) {
            problems.push(format!(
                "{path}: the cargo zigbuild RUN does not carry {part}"
            ));
        }
    }
    for (variable, arg) in [
        ("BITGAUGE_VERSION", "VERSION"),
        ("BITGAUGE_COMMIT", "COMMIT"),
        ("BITGAUGE_DATE", "DATE"),
    ] {
        let stamp = format!("{variable}=\"${{{arg}}}\"");
        if !run.contains(&stamp) {
            problems.push(format!(
                "{path}: the cargo zigbuild RUN does not set {stamp}, so the binary reports \
                 the unstamped build"
            ));
        }
        if !args.contains_key(arg) {
            problems.push(format!(
                "{path}: the build stage does not declare ARG {arg}"
            ));
        }
    }
    problems
}
