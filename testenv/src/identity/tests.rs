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

//! The identity check's judgments on recorded answers and synthetic archives, and its sequence
//! of docker commands on a fake runner.

use std::fs;
use std::io::Write as _;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use flate2::Compression;
use flate2::write::GzEncoder;

use super::{
    Expectation, GO_USAGE, IdentityError, Implementation, RUST_REFUSAL, check, check_binary,
    check_help, check_revision, sha256_hex,
};
use crate::docker::{DockerError, Output, Runner};
use crate::env::{DockerProvider, Provider, Spec};
use crate::logger::Logger;

/// What the Go binary answered to `-help`: `ghcr.io/leinardi/bitgauge:966a616-dirty`, run as
/// `docker run --rm --entrypoint /bitgauge <image> -help`, exited 0 with these two outputs.
const GO_STDOUT: &str = include_str!("testdata/go_dash_help.stdout");
const GO_STDERR: &str = include_str!("testdata/go_dash_help.stderr");
/// What the Rust binary answered: `bitgauge:rust-candidate` at e5fcc5f, the same command, exit 2
/// and nothing on stdout.
const RUST_STDERR: &str = include_str!("testdata/rust_dash_help.stderr");

fn answer(status: i32, stdout: &str, stderr: &str) -> Output {
    Output {
        status: Some(status),
        stdout: stdout.to_owned(),
        stderr: stderr.to_owned(),
    }
}

fn go_answer() -> Output {
    answer(0, GO_STDOUT, GO_STDERR)
}

fn rust_answer() -> Output {
    answer(2, "", RUST_STDERR)
}

/// The constants are the recorded answers, so the check matches what the binaries print.
#[test]
fn the_constants_are_the_recorded_answers() {
    assert_eq!(RUST_REFUSAL, RUST_STDERR);
    assert_eq!(GO_USAGE, GO_STDOUT);
}

/// Each build's real answer passes for itself, and the crossed one is refused, naming the image.
#[test]
fn each_answer_identifies_its_build() {
    check_help(Implementation::Go, "go:x", &go_answer()).unwrap();
    check_help(Implementation::Rust, "rust:x", &rust_answer()).unwrap();
    let error = check_help(Implementation::Rust, "go:x", &go_answer()).unwrap_err();
    assert!(
        error.to_string().starts_with(concat!(
            "image go:x is not the Rust build: -help exited 0 with stdout ",
            r#""usage: bitgauge [serve|healthcheck] [--config /etc/bitgauge/config.yaml]\n""#,
            r#" and stderr "Usage of bitgauge serve:" (first line of 121 bytes), want exit 2"#
        )),
        "{error}"
    );
    let error = check_help(Implementation::Go, "rust:x", &rust_answer()).unwrap_err();
    assert!(
        error
            .to_string()
            .starts_with("image rust:x is not the Go build: -help exited 2 with stdout \"\""),
        "{error}"
    );
}

/// Every part of the answer counts: the code, the text, and which stream it is on.
#[test]
fn a_partial_answer_is_refused() {
    let mut accepted = Vec::new();
    for (name, expected, given) in [
        (
            "Rust text, exit 0",
            Implementation::Rust,
            answer(0, "", RUST_STDERR),
        ),
        (
            "Rust text, exit 1",
            Implementation::Rust,
            answer(1, "", RUST_STDERR),
        ),
        (
            "Rust text, killed",
            Implementation::Rust,
            Output {
                status: None,
                stdout: String::new(),
                stderr: RUST_STDERR.to_owned(),
            },
        ),
        (
            "Rust refusal without the usage",
            Implementation::Rust,
            answer(
                2,
                "",
                "bitgauge: -help is not an option; write it as --help\n",
            ),
        ),
        (
            "Rust text on stdout too",
            Implementation::Rust,
            answer(2, "x\n", RUST_STDERR),
        ),
        (
            "Rust twice",
            Implementation::Rust,
            answer(2, "", &RUST_STDERR.repeat(2)),
        ),
        ("nothing, exit 2", Implementation::Rust, answer(2, "", "")),
        (
            "docker could not run the image",
            Implementation::Rust,
            answer(125, "", "Unable to find image 'x' locally\n"),
        ),
        (
            "Go text, exit 2",
            Implementation::Go,
            answer(2, GO_STDOUT, GO_STDERR),
        ),
        (
            "Go text, exit 1",
            Implementation::Go,
            answer(1, GO_STDOUT, GO_STDERR),
        ),
        (
            "Go usage on stderr",
            Implementation::Go,
            answer(0, "", GO_STDOUT),
        ),
        (
            "Go without the flag defaults",
            Implementation::Go,
            answer(0, GO_STDOUT, ""),
        ),
        (
            "Go usage twice",
            Implementation::Go,
            answer(0, &GO_STDOUT.repeat(2), GO_STDERR),
        ),
        ("nothing, exit 0", Implementation::Go, answer(0, "", "")),
    ] {
        if check_help(expected, "x", &given).is_ok() {
            accepted.push(name);
        }
    }
    assert!(accepted.is_empty(), "accepted: {accepted:?}");
}

/// The revision label must be the expected commit; a missing label or label set is a failure.
#[test]
fn the_revision_label_names_the_commit() {
    let labels = r#"{"org.opencontainers.image.revision":"e5fcc5f","org.opencontainers.image.title":"bitgauge"}"#;
    check_revision("x", labels, "e5fcc5f").unwrap();
    check_revision("x", &format!("{labels}\n"), "e5fcc5f").unwrap();
    assert!(matches!(
        check_revision("x", labels, "966a61679e12"),
        Err(IdentityError::RevisionMismatch { found, .. }) if found == "e5fcc5f"
    ));
    // A prefix is not the commit.
    assert!(check_revision("x", labels, "e5fcc5").is_err());
    assert!(matches!(
        check_revision(
            "x",
            r#"{"org.opencontainers.image.title":"bitgauge"}"#,
            "e5fcc5f"
        ),
        Err(IdentityError::RevisionMissing { .. })
    ));
    assert!(matches!(
        check_revision("x", "null", "e5fcc5f"),
        Err(IdentityError::RevisionMissing { .. })
    ));
    assert!(matches!(
        check_revision("x", "not json", "e5fcc5f"),
        Err(IdentityError::Unreadable(_))
    ));
}

/// A tar of `files`, each `(path, content)`.
fn tar_of(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, content) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(u64::try_from(content.len()).unwrap());
        header.set_mode(0o755);
        header.set_cksum();
        builder.append_data(&mut header, path, *content).unwrap();
    }
    builder.into_inner().unwrap()
}

/// [`tar_of`] with a symlink at `link` to `target` after the files.
fn with_symlink(files: &[(&str, &[u8])], link: &str, target: &str) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, content) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(u64::try_from(content.len()).unwrap());
        header.set_cksum();
        builder.append_data(&mut header, path, *content).unwrap();
    }
    let mut header = tar::Header::new_gnu();
    header.set_entry_type(tar::EntryType::Symlink);
    header.set_size(0);
    builder.append_link(&mut header, link, target).unwrap();
    builder.into_inner().unwrap()
}

fn gzip(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(bytes).unwrap();
    encoder.finish().unwrap()
}

/// A legacy `docker save` archive: `manifest.json` and one `<id>/layer.tar` per layer.
fn legacy(layers: &[Vec<u8>]) -> Vec<u8> {
    let names: Vec<String> = (0..layers.len())
        .map(|index| format!("l{index}/layer.tar"))
        .collect();
    let manifest =
        serde_json::json!([{"Config": "config.json", "RepoTags": ["x:y"], "Layers": names}])
            .to_string();
    let mut files: Vec<(&str, &[u8])> = vec![("manifest.json", manifest.as_bytes())];
    for (name, layer) in names.iter().zip(layers) {
        files.push((name, layer));
    }
    tar_of(&files)
}

/// A pure OCI layout, without `manifest.json`: `index.json`, a nested index, an image manifest
/// and the layer blobs.
fn oci(layers: &[Vec<u8>]) -> Vec<u8> {
    let digests: Vec<String> = layers.iter().map(|layer| sha256_hex(layer)).collect();
    let manifest = serde_json::json!({
        "schemaVersion": 2,
        "layers": digests.iter().map(|digest| serde_json::json!({
            "mediaType": "application/vnd.oci.image.layer.v1.tar",
            "digest": format!("sha256:{digest}"),
        })).collect::<Vec<_>>(),
    })
    .to_string();
    let manifest_digest = sha256_hex(manifest.as_bytes());
    let nested =
        serde_json::json!({"manifests": [{"digest": format!("sha256:{manifest_digest}")}]})
            .to_string();
    let nested_digest = sha256_hex(nested.as_bytes());
    let index = serde_json::json!({"manifests": [{"digest": format!("sha256:{nested_digest}")}]})
        .to_string();
    let blob = |digest: &str| format!("blobs/sha256/{digest}");
    let mut owned: Vec<(String, Vec<u8>)> = vec![
        ("index.json".to_owned(), index.into_bytes()),
        (
            "oci-layout".to_owned(),
            br#"{"imageLayoutVersion":"1.0.0"}"#.to_vec(),
        ),
        (blob(&nested_digest), nested.into_bytes()),
        (blob(&manifest_digest), manifest.into_bytes()),
    ];
    for (digest, layer) in digests.iter().zip(layers) {
        owned.push((blob(digest), layer.clone()));
    }
    let files: Vec<(&str, &[u8])> = owned
        .iter()
        .map(|(name, content)| (name.as_str(), content.as_slice()))
        .collect();
    tar_of(&files)
}

const BINARY: &[u8] = b"\x7fELF the binary";

fn base() -> Vec<u8> {
    tar_of(&[("etc/passwd", b"root:x:0:0\n")])
}

/// Both layouts are read, a gzip layer included, and the binary's sha256 is returned.
#[test]
fn the_binary_is_found_in_both_layouts() {
    let top = tar_of(&[("./bitgauge", BINARY)]);
    for (name, archive) in [
        ("legacy", legacy(&[base(), top.clone()])),
        ("OCI", oci(&[base(), top.clone()])),
        ("OCI, gzip", oci(&[gzip(&base()), gzip(&top)])),
        ("legacy, gzip", legacy(&[base(), gzip(&top)])),
    ] {
        assert_eq!(
            check_binary("x", BINARY, &archive).unwrap_or_else(|error| panic!("{name}: {error}")),
            sha256_hex(BINARY),
            "{name}"
        );
    }
}

/// The last layer that holds the file wins, as an overlay shows it; a later whiteout hides it.
#[test]
fn the_last_layer_wins() {
    let old = tar_of(&[("bitgauge", b"old")]);
    let new = tar_of(&[("bitgauge", BINARY)]);
    let unrelated = tar_of(&[("srv/x", b"x")]);
    assert!(check_binary("x", BINARY, &oci(&[old.clone(), new.clone(), unrelated])).is_ok());
    assert!(matches!(
        check_binary("x", BINARY, &oci(&[new.clone(), old])),
        Err(IdentityError::ChecksumMismatch { .. })
    ));
    let whiteout = tar_of(&[(".wh.bitgauge", b"")]);
    assert!(matches!(
        check_binary("x", BINARY, &legacy(&[new.clone(), whiteout])),
        Err(IdentityError::NoLayerBinary { .. })
    ));
    let opaque_then_file = tar_of(&[(".wh..wh..opq", b""), ("bitgauge", BINARY)]);
    assert!(check_binary("x", BINARY, &legacy(&[base(), opaque_then_file])).is_ok());
}

/// A copy that differs from the layer, a layer without the binary, a manifest that names a
/// missing layer, and an archive that is no image are each a failure.
#[test]
fn a_mismatch_or_a_missing_file_fails() {
    let archive = legacy(&[base(), tar_of(&[("bitgauge", BINARY)])]);
    let error = check_binary("img", b"another binary", &archive).unwrap_err();
    assert!(
        matches!(&error, IdentityError::ChecksumMismatch { layer, .. } if *layer == sha256_hex(BINARY)),
        "{error}"
    );
    assert!(matches!(
        check_binary("img", BINARY, &legacy(&[base()])),
        Err(IdentityError::NoLayerBinary { .. })
    ));
    let manifest = r#"[{"Layers": ["l0/layer.tar", "gone/layer.tar"]}]"#;
    let missing = tar_of(&[
        ("manifest.json", manifest.as_bytes()),
        ("l0/layer.tar", &base()),
    ]);
    let error = check_binary("img", BINARY, &missing).unwrap_err();
    assert!(
        error.to_string().contains("missing entry gone/layer.tar"),
        "{error}"
    );
    for (name, archive) in [
        ("no manifest", tar_of(&[("x", b"x")])),
        (
            "not a tar",
            b"not a tar at all, and long enough to be read as one".repeat(20),
        ),
        (
            "two images",
            tar_of(&[("manifest.json", br#"[{"Layers": []}, {"Layers": []}]"#)]),
        ),
    ] {
        assert!(
            matches!(
                check_binary("img", BINARY, &archive),
                Err(IdentityError::Unreadable(_))
            ),
            "{name}"
        );
    }
}

/// A legacy archive may hold a layer as a symlink to another layer's tar.
#[test]
fn a_symlinked_layer_is_followed() {
    let layer = tar_of(&[("bitgauge", BINARY)]);
    let manifest = r#"[{"Layers": ["a/layer.tar", "b/layer.tar"]}]"#;
    let archive = with_symlink(
        &[
            ("manifest.json", manifest.as_bytes()),
            ("a/layer.tar", &layer),
        ],
        "b/layer.tar",
        "../a/layer.tar",
    );
    assert_eq!(
        check_binary("x", BINARY, &archive).unwrap(),
        sha256_hex(BINARY)
    );
}

/// The three variables are required, with no default, and the implementation is exactly `go`
/// or `rust`.
#[test]
fn the_expectation_is_required() {
    let lookup = |values: &'static [(&'static str, &'static str)]| {
        move |key: &str| {
            values
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| (*value).to_owned())
        }
    };
    let complete: &'static [(&str, &str)] = &[
        ("BITGAUGE_TEST_IMPL", "rust"),
        ("BITGAUGE_TEST_IMAGE", "bitgauge:rust-candidate"),
        ("BITGAUGE_TEST_COMMIT", "e5fcc5f"),
    ];
    assert_eq!(
        Expectation::from_lookup(lookup(complete)).unwrap(),
        Expectation {
            implementation: Implementation::Rust,
            image: "bitgauge:rust-candidate".to_owned(),
            commit: "e5fcc5f".to_owned(),
        }
    );
    for (name, values, want) in [
        ("no variable", &[][..], "BITGAUGE_TEST_IMPL is required"),
        (
            "an empty implementation",
            &[
                ("BITGAUGE_TEST_IMPL", ""),
                ("BITGAUGE_TEST_IMAGE", "x"),
                ("BITGAUGE_TEST_COMMIT", "y"),
            ][..],
            "BITGAUGE_TEST_IMPL is required",
        ),
        (
            "a capitalized implementation",
            &[
                ("BITGAUGE_TEST_IMPL", "Go"),
                ("BITGAUGE_TEST_IMAGE", "x"),
                ("BITGAUGE_TEST_COMMIT", "y"),
            ][..],
            r#"BITGAUGE_TEST_IMPL must be go or rust, not "Go""#,
        ),
        (
            "another implementation",
            &[
                ("BITGAUGE_TEST_IMPL", "c"),
                ("BITGAUGE_TEST_IMAGE", "x"),
                ("BITGAUGE_TEST_COMMIT", "y"),
            ][..],
            r#"BITGAUGE_TEST_IMPL must be go or rust, not "c""#,
        ),
        (
            "no image",
            &[("BITGAUGE_TEST_IMPL", "go"), ("BITGAUGE_TEST_COMMIT", "y")][..],
            "BITGAUGE_TEST_IMAGE is required",
        ),
        (
            "an empty commit",
            &[
                ("BITGAUGE_TEST_IMPL", "go"),
                ("BITGAUGE_TEST_IMAGE", "x"),
                ("BITGAUGE_TEST_COMMIT", ""),
            ][..],
            "BITGAUGE_TEST_COMMIT is required",
        ),
    ] {
        let error = Expectation::from_lookup(lookup(values)).unwrap_err();
        assert!(error.to_string().starts_with(want), "{name}: {error}");
    }
    assert_eq!(Implementation::Go.other(), Implementation::Rust);
    assert_eq!(
        Implementation::parse(Implementation::Rust.as_str()),
        Some(Implementation::Rust)
    );
}

/// A fake daemon holding one image: it answers the help run, the inspect, and writes the copied
/// binary and the saved archive where the commands say.
struct FakeImage {
    help: Output,
    labels: String,
    copied: Vec<u8>,
    archive: Vec<u8>,
    commands: Mutex<Vec<String>>,
}

impl FakeImage {
    fn new(help: Output, copied: &[u8]) -> Self {
        Self {
            help,
            labels: r#"{"org.opencontainers.image.revision":"abc1234"}"#.to_owned(),
            copied: copied.to_vec(),
            archive: legacy(&[base(), tar_of(&[("bitgauge", BINARY)])]),
            commands: Mutex::default(),
        }
    }
}

impl Runner for FakeImage {
    fn output(&self, args: &[&str], _: Option<Duration>) -> Result<Output, DockerError> {
        self.commands.lock().unwrap().push(args.join(" "));
        let ok = |stdout: &str| Ok(Output::ok(stdout));
        match args {
            ["run", ..] => Ok(self.help.clone()),
            ["image", "inspect", ..] => ok(&self.labels),
            ["cp", _, target] => {
                fs::write(target, &self.copied).unwrap();
                ok("")
            }
            ["image", "save", "--output", path, _] => {
                fs::write(path, &self.archive).unwrap();
                ok("")
            }
            _ => ok(""),
        }
    }
}

fn run_check(
    image: FakeImage,
    implementation: Implementation,
) -> (Result<super::Identity, IdentityError>, Vec<String>) {
    let image = Arc::new(image);
    let env = DockerProvider::new(Arc::clone(&image) as _)
        .up(Spec {
            env_id: "ident000".to_owned(),
            keep_on_failure: false,
            logger: Some(Logger::discard()),
        })
        .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let expectation = Expectation {
        implementation,
        image: "bitgauge:test".to_owned(),
        commit: "abc1234".to_owned(),
    };
    let result = check(&env, &expectation, dir.path());
    if let Ok(identity) = &result {
        assert_eq!(fs::read(&identity.binary).unwrap(), BINARY);
    }
    let commands = image.commands.lock().unwrap().clone();
    (result, commands)
}

/// The check runs the help flag, the inspect, the copy from a created container (removed
/// after), and the save, in that order, all labeled and never pulling; a mismatch at any step
/// stops it.
#[test]
fn the_check_runs_in_order() {
    let (result, commands) = run_check(FakeImage::new(rust_answer(), BINARY), Implementation::Rust);
    let identity = result.unwrap();
    assert_eq!(identity.sha256, sha256_hex(BINARY));
    assert_eq!(identity.implementation, Implementation::Rust);
    let verbs: Vec<String> = commands
        .iter()
        .map(|command| command.split(' ').take(2).collect::<Vec<_>>().join(" "))
        .collect();
    assert_eq!(
        verbs,
        [
            "run --label",
            "image inspect",
            "create --label",
            "cp bitgauge-test-ident000-identity:/bitgauge",
            "rm --force",
            "image save"
        ]
    );
    assert!(
        commands[0].ends_with("--rm --pull never --entrypoint /bitgauge bitgauge:test -help"),
        "{}",
        commands[0]
    );
    assert!(
        commands[2].ends_with("--pull never --name bitgauge-test-ident000-identity bitgauge:test"),
        "{}",
        commands[2]
    );

    let (result, commands) = run_check(FakeImage::new(go_answer(), BINARY), Implementation::Rust);
    assert!(matches!(result, Err(IdentityError::Help { .. })));
    assert_eq!(
        commands.len(),
        1,
        "the check went on after the help flag: {commands:?}"
    );

    let mut relabeled = FakeImage::new(go_answer(), BINARY);
    relabeled.labels = r#"{"org.opencontainers.image.revision":"other"}"#.to_owned();
    let (result, _) = run_check(relabeled, Implementation::Go);
    assert!(matches!(
        result,
        Err(IdentityError::RevisionMismatch { .. })
    ));

    let (result, commands) =
        run_check(FakeImage::new(go_answer(), b"tampered"), Implementation::Go);
    assert!(matches!(
        result,
        Err(IdentityError::ChecksumMismatch { .. })
    ));
    assert!(
        commands
            .iter()
            .any(|command| command.starts_with("rm --force"))
    );
}
