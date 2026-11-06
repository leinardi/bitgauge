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
//!
//! The rules are rust-common's `repo_meta::image` with BitGauge's parameters: every base from
//! dhi.io by an explicit tag alone, the exact `dhi.io/rust:<release>-debian13-dev` build image,
//! each download checked in its RUN against the `(platform, asset, sha256)` arms of
//! `.mk/rust-release.mk`, and the stamps in the RUN that runs cargo zigbuild. The healthcheck and
//! the cargo zigbuild invocation are BitGauge's own and stay here.

use repo_meta::dockerfile::{self, Stage};
use repo_meta::image::{
    self, BasePolicy, BuildBase, BuildStage, Download, RuntimeStage, STAMP_FIELDS, StampSources,
    Stamps,
};
use repo_meta::toolchain::{self, RUST_RELEASE_PINS, RustVersion};
use repo_meta::{Problem, Repo};

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
/// The named stages of the image Dockerfile, in order.
const STAGES: [&str; 3] = ["web", "build", "runtime"];
/// The platform both build stages run on: the SPA is architecture-free, and both toolchains
/// cross-compile, so no emulation is needed.
const BUILD_PLATFORM: &str = "$BUILDPLATFORM";

/// `problems` as `path: message` lines, the ones without a location placed at `path`.
fn at(path: &str, problems: Vec<Problem>) -> Vec<String> {
    problems
        .into_iter()
        .map(|problem| {
            if problem.location.is_empty() {
                format!("{path}: {}", problem.message)
            } else {
                problem.to_string()
            }
        })
        .collect()
}

/// The stages of `content`, or the one problem that it cannot be read.
fn stages(path: &str, content: &str) -> Result<Vec<Stage>, Vec<String>> {
    dockerfile::parse(content).map_err(|error| vec![format!("{path}: {error}")])
}

/// The stage of `stages` named `name`, if there is exactly one.
fn named<'stages>(
    path: &str,
    stages: &'stages [Stage],
    name: &str,
) -> Result<&'stages Stage, Vec<String>> {
    dockerfile::stage_named(path, stages, name).map_err(|problem| vec![problem.to_string()])
}

/// The named stages, in order, of an image Dockerfile: web, build and runtime, each from a
/// literal dhi.io base pinned by an explicit tag and no digest. Dependabot updates only literal
/// FROM lines, a missing or latest tag says nothing about what is built, and dhi.io republishes
/// its tags to ship security fixes, which a digest would hold back.
pub fn layout_problems(path: &str, content: &str) -> Vec<String> {
    at(
        path,
        image::stage_problems(path, content, &STAGES, BasePolicy::DhiOnly),
    )
}

/// The files the Rust build stage must agree with: `rust-toolchain.toml` (the release), the
/// `.mk/rust-release.mk` record of the release pins, and the make side and the version module of
/// the version stamps.
#[derive(Debug, Clone)]
pub struct BuildFiles {
    pub toolchain: String,
    pub release_mk: String,
    pub makefile: String,
    pub rust_mk: String,
    pub version_rs: String,
}

/// The release fragment, the stamps' make files and the version module.
pub const RUST_TOOLCHAIN: &str = "rust-toolchain.toml";
pub const RUST_RELEASE_MK: &str = ".mk/rust-release.mk";
pub const MAKEFILE: &str = "Makefile";
pub const RUST_MK: &str = ".mk/rust.mk";
const VERSION_RS: &str = "src/buildinfo.rs";

impl BuildFiles {
    /// The files as the repository has them.
    pub fn read(repo: &Repo) -> Self {
        Self {
            toolchain: repo.read(RUST_TOOLCHAIN),
            release_mk: repo.read(RUST_RELEASE_MK),
            makefile: repo.read(MAKEFILE),
            rust_mk: repo.read(RUST_MK),
            version_rs: repo.read(VERSION_RS),
        }
    }

    /// The exact release `rust-toolchain.toml` pins.
    pub fn release(&self) -> Result<String, Problem> {
        toolchain::rust_release(RUST_TOOLCHAIN, &self.toolchain)
    }

    /// The value `.mk/rust-release.mk` gives `variable`, empty when it sets none (which no pin
    /// matches).
    fn pin(&self, variable: &str) -> String {
        toolchain::make_value(&self.release_mk, variable).unwrap_or_default()
    }

    /// The `(platform, asset, sha256)` arms of the release archive whose case variable is `key`:
    /// each required arm of the shared release pins, with `.mk/rust-release.mk`'s digest.
    fn arms(&self, key: &str) -> Vec<(String, String, String)> {
        RUST_RELEASE_PINS
            .archives
            .iter()
            .filter(|archive| archive.key == key)
            .flat_map(|archive| {
                archive.arms.iter().map(|(platform, asset)| {
                    (
                        (*platform).to_owned(),
                        (*asset).to_owned(),
                        self.pin(&format!("{}{asset}", archive.prefix)),
                    )
                })
            })
            .collect()
    }

    /// The archives the Rust build stage downloads, each at the release and with the arms
    /// `.mk/rust-release.mk` pins.
    fn downloads(&self) -> [Download<'static>; 3] {
        [
            Download {
                tool: "zig",
                url: "https://ziglang.org/download/${ZIG_VERSION}/zig-${zig_arch}-linux-${ZIG_VERSION}.tar.xz",
                platform_arg: "BUILDARCH",
                version_arg: "ZIG_VERSION",
                version: self.pin("RUST_RELEASE_ZIG_VERSION"),
                asset_var: "zig_arch",
                sha_var: "zig_sha256",
                arms: self.arms("zig_arch"),
            },
            Download {
                tool: "cargo-zigbuild",
                url: "https://github.com/rust-cross/cargo-zigbuild/releases/download/v${CARGO_ZIGBUILD_VERSION}/cargo-zigbuild-${zigbuild_asset}.tar.xz",
                platform_arg: "BUILDARCH",
                version_arg: "CARGO_ZIGBUILD_VERSION",
                version: self.pin("RUST_RELEASE_CARGO_ZIGBUILD_VERSION"),
                asset_var: "zigbuild_asset",
                sha_var: "zigbuild_sha256",
                arms: self.arms("zigbuild_asset"),
            },
            Download {
                tool: "the musl rust-std",
                url: "https://static.rust-lang.org/dist/rust-std-${RUST_VERSION}-${triple}.tar.xz",
                platform_arg: "TARGETARCH",
                version_arg: "RUST_VERSION",
                version: self.pin("RUST_RELEASE_RUST_STD_VERSION"),
                asset_var: "triple",
                sha_var: "std_sha256",
                arms: self.arms("triple"),
            },
        ]
    }
}

/// The rules of the web stage: on the build platform, from dhi.io/node, downloading nothing.
const WEB_STAGE: BuildStage<'static> = BuildStage {
    platform: BUILD_PLATFORM,
    base: BuildBase::Repository("dhi.io/node"),
    required: &[],
    downloads: &[],
};

/// The rules of the Rust build stage at `release`: on the build platform, from exactly
/// `dhi.io/rust:<release>-debian13-dev`, and every download one of `downloads`, checked in its
/// RUN.
fn rust_stage_problems(
    path: &str,
    build: &Stage,
    release: &str,
    downloads: &[Download<'_>],
) -> Vec<String> {
    let image = format!("{RUST_BUILD_REPOSITORY}:{release}-{RUST_BUILD_VARIANT}");
    let rules = BuildStage {
        platform: BUILD_PLATFORM,
        base: BuildBase::Exact(&image),
        required: &[],
        downloads,
    };
    at(path, image::build_stage_problems(build, &rules))
}

/// Where the build stages run and what they start from: both on the build platform, web from
/// dhi.io/node and build from exactly `dhi.io/rust:<release>-debian13-dev`, and each fetches
/// only what its rules name.
pub fn build_stage_problems(path: &str, content: &str, files: &BuildFiles) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let release = match files.release() {
        Ok(release) => release,
        Err(problem) => return vec![problem.to_string()],
    };
    let mut problems = Vec::new();
    match named(path, &stages, "web") {
        Ok(web) => problems.extend(at(path, image::build_stage_problems(web, &WEB_STAGE))),
        Err(found) => problems.extend(found),
    }
    match named(path, &stages, "build") {
        Ok(build) => problems.extend(rust_stage_problems(
            path,
            build,
            &release,
            &files.downloads(),
        )),
        Err(found) => problems.extend(found),
    }
    problems
}

/// The runtime stage's rules: from dhi.io/static on the target platform, no shell to run
/// anything in and nothing to write to, an unprivileged numeric user, one port and the binary as
/// the exec-form entrypoint.
const RUNTIME_STAGE: RuntimeStage<'static> = RuntimeStage {
    repository: "dhi.io/static",
    forbidden: &["RUN", "SHELL", "VOLUME", "WORKDIR", "ADD", "ENV"],
    exactly: &[
        ("USER", RUNTIME_USER),
        ("EXPOSE", "8080"),
        ("ENTRYPOINT", r#"["/bitgauge"]"#),
        ("COPY", "--from=build /out/bitgauge /bitgauge"),
    ],
};

/// Exactly the seven OCI labels, the description any non-empty text.
const LABELS: &[(&str, Option<&str>)] = &[
    ("org.opencontainers.image.title", Some("bitgauge")),
    ("org.opencontainers.image.description", None),
    (
        "org.opencontainers.image.source",
        Some("https://github.com/leinardi/bitgauge"),
    ),
    ("org.opencontainers.image.version", Some("${VERSION}")),
    ("org.opencontainers.image.revision", Some("${COMMIT}")),
    ("org.opencontainers.image.created", Some("${DATE}")),
    (
        "org.opencontainers.image.licenses",
        Some("GPL-3.0-or-later"),
    ),
];

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
        Err(problems) => return problems,
    };
    let mut problems = at(path, image::runtime_problems(runtime, &RUNTIME_STAGE));
    let healthchecks: Vec<&str> = runtime
        .instructions
        .iter()
        .filter(|instruction| instruction.keyword == "HEALTHCHECK")
        .map(|instruction| instruction.args.as_str())
        .collect();
    if !matches!(healthchecks.as_slice(), [only] if only.ends_with(HEALTHCHECK_COMMAND)) {
        problems.push(format!(
            "{path}: the runtime stage has HEALTHCHECK {healthchecks:?}, want one ending \
             in{HEALTHCHECK_COMMAND}"
        ));
    }
    problems.extend(at(path, image::label_problems(runtime, LABELS)));
    problems
}

/// The version stamps: `BITGAUGE_VERSION`, `_COMMIT` and `_DATE`, which the version module reads
/// at compile time, set in the RUN that runs cargo zigbuild from the build arguments, and by make
/// from its git values in `rust-dist`, `rust-run` and the release recipe (`rust-build` builds
/// unstamped, as the tests do: `RUST_BUILD_ENV :=` in the Makefile).
const STAMPS: Stamps<'static> = Stamps {
    prefix: "BITGAUGE",
    fields: &STAMP_FIELDS,
    version_file: VERSION_RS,
    build_command: "cargo zigbuild",
};

/// The version stamps of the image's build stage and of make (`STAMPS`).
pub fn stamp_problems(path: &str, content: &str, files: &BuildFiles) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let build = match named(path, &stages, "build") {
        Ok(stage) => stage,
        Err(problems) => return problems,
    };
    at(
        path,
        STAMPS.problems(&StampSources {
            version_rs: &files.version_rs,
            build,
            makefile: &files.makefile,
            rust_mk: &files.rust_mk,
            release: Some((&files.release_mk, "rust_static_build")),
        }),
    )
}

/// The Rust build stage: FROM `dhi.io/rust:<release>-debian13-dev` on the build platform, the
/// release being rust-toolchain.toml's and `RUST_VERSION` the image's own; zig, cargo-zigbuild
/// and the musl rust-std each downloaded at the pinned release and checked against exactly the
/// pinned arms; and the binary built with cargo-zigbuild for the target, release and locked,
/// with the version stamps, into the path the runtime stage copies.
pub fn rust_build_problems(path: &str, content: &str, files: &BuildFiles) -> Vec<String> {
    let stages = match stages(path, content) {
        Ok(stages) => stages,
        Err(problems) => return problems,
    };
    let build = match named(path, &stages, "build") {
        Ok(stage) => stage,
        Err(problems) => return problems,
    };
    let release = match files.release() {
        Ok(release) => release,
        Err(problem) => return vec![problem.to_string()],
    };
    let mut problems = rust_stage_problems(path, build, &release, &files.downloads());
    problems.extend(at(
        path,
        toolchain::image_rust_problems(path, content, &release, RustVersion::Exact),
    ));
    problems.extend(stamp_problems(path, content, files));
    problems.extend(cargo_build_problems(path, build));
    problems
}

/// The cargo-zigbuild invocation: release, locked, for the downloaded target, copied to the path
/// the runtime stage takes, in the one RUN that runs it.
fn cargo_build_problems(path: &str, build: &Stage) -> Vec<String> {
    let runs: Vec<&str> = build
        .instructions
        .iter()
        .filter(|instruction| {
            instruction.keyword == "RUN" && instruction.args.contains("cargo zigbuild")
        })
        .map(|instruction| instruction.args.as_str())
        .collect();
    let [run] = runs.as_slice() else {
        return vec![format!(
            "{path}: {} RUN instructions run cargo zigbuild, want one",
            runs.len()
        )];
    };
    [
        "cargo zigbuild --release --locked --target \"${triple}\" --bin bitgauge",
        "cp \"target/${triple}/release/bitgauge\" /out/bitgauge",
    ]
    .into_iter()
    .filter(|part| !run.contains(part))
    .map(|part| format!("{path}: the cargo zigbuild RUN does not carry {part}"))
    .collect()
}
