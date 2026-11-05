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
//! The command's tests.

use std::ffi::OsString;
use std::process::ExitCode;
use std::thread;
use std::time::Duration;

use bytes::Bytes;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

use super::{Mode, Process, compatibility_layers, run};
use crate::config::Config;
use crate::server::conn::Lifecycle;
use crate::test_support::{Capture, dial_loopback};
use crate::web::{Files, ROOT_ASSETS, RenderError, Spa};

/// The scratch SPA of the tests that run serve: a checkout that has not built the SPA embeds
/// none.
fn render_scratch(base_path: &str) -> Result<Spa, RenderError> {
    let mut files = Files::new();
    files.insert(
        "index.html".to_owned(),
        Bytes::from_static(
            br#"<meta name="bitgauge-base-path" content="/" /><script type="module" src="./assets/index-a1.js"></script>"#,
        ),
    );
    files.insert(
        "assets/index-a1.js".to_owned(),
        Bytes::from_static(b"export {}"),
    );
    for (name, _) in ROOT_ASSETS {
        files.insert(name.to_owned(), Bytes::from_static(name.as_bytes()));
    }
    Spa::render_files(files, base_path)
}

/// The SPA of a binary built without the web build: only `.gitkeep`.
fn render_incomplete(base_path: &str) -> Result<Spa, RenderError> {
    Spa::render_files(
        Files::from([(".gitkeep".to_owned(), Bytes::new())]),
        base_path,
    )
}

struct Outputs {
    stdout: Capture,
    stderr: Capture,
}

fn process(
    environment: &[(&str, &str)],
    render: super::Render,
) -> (Process<Capture, Capture>, Outputs) {
    let outputs = Outputs {
        stdout: Capture::default(),
        stderr: Capture::default(),
    };
    let process = Process {
        stdout: outputs.stdout.clone(),
        stderr: outputs.stderr.clone(),
        environment: environment
            .iter()
            .map(|&(name, value)| (name.to_owned(), value.to_owned()))
            .collect(),
        render,
        mode: Mode::InProcess,
        lifecycle: Lifecycle::new(),
    };
    (process, outputs)
}

fn args(list: &[&str]) -> Vec<OsString> {
    list.iter().map(OsString::from).collect()
}

/// A configuration file of `src/command/testdata`.
fn fixture(name: &str) -> String {
    format!("{}/src/command/testdata/{name}", env!("CARGO_MANIFEST_DIR"))
}

/// Go: `TestServeExitsTwoOnInvalidConfig`, in the process: every configuration that cannot run
/// exits 2 for serve, and 1 for the health check, whose 2 a container runtime reserves.
#[test]
fn an_invalid_configuration_exits_two_or_one_for_the_health_check() {
    let empty = fixture("empty.yaml");
    let invalid = fixture("invalid.yaml");
    let absent = fixture("absent.yaml");
    for (name, line, environment, want) in [
        (
            "missing explicit file",
            vec!["--config", absent.as_str()],
            &[][..],
            2,
        ),
        (
            "invalid file value",
            vec!["--config", invalid.as_str()],
            &[][..],
            2,
        ),
        (
            "invalid environment value",
            vec!["serve", "--config", empty.as_str()],
            &[("BITGAUGE_LOG__LEVEL", "loud")][..],
            2,
        ),
        (
            "metrics.path collision",
            vec!["--config", empty.as_str()],
            &[("BITGAUGE_METRICS__PATH", "/upload")][..],
            2,
        ),
        (
            "server.labels item without =",
            vec!["--config", empty.as_str()],
            &[("BITGAUGE_SERVER__LABELS", "10.8.0.0/24")][..],
            2,
        ),
        (
            "OpenSpeedTest with a 16 MiB download cap",
            vec!["--config", empty.as_str()],
            &[
                ("BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED", "true"),
                ("BITGAUGE_LIMITS__MAX_DOWNLOAD_BYTES", "16MiB"),
            ][..],
            2,
        ),
        (
            "LibreSpeed with a 512 KiB download cap",
            vec!["--config", empty.as_str()],
            &[
                ("BITGAUGE_COMPAT__LIBRESPEED__ENABLED", "true"),
                ("BITGAUGE_LIMITS__MAX_DOWNLOAD_BYTES", "512KiB"),
            ][..],
            2,
        ),
        (
            "networkQuality without an https origin",
            vec!["--config", empty.as_str()],
            &[
                ("BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED", "true"),
                ("BITGAUGE_SERVER__PUBLIC_URL", "http://speed.lan"),
            ][..],
            2,
        ),
        (
            "OpenSpeedTest with a 32 MiB upload cap",
            vec!["--config", empty.as_str()],
            &[
                ("BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED", "true"),
                ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES", "32MiB"),
            ][..],
            2,
        ),
        ("unknown command", vec!["version"], &[][..], 2),
        (
            "single-dash long option",
            vec!["-config", empty.as_str()],
            &[][..],
            2,
        ),
        (
            "healthcheck with an invalid file",
            vec!["healthcheck", "--config", invalid.as_str()],
            &[][..],
            1,
        ),
        (
            "healthcheck with a missing file",
            vec!["healthcheck", "--config", absent.as_str()],
            &[][..],
            1,
        ),
    ] {
        let (process, _outputs) = process(environment, render_scratch);
        assert_eq!(run(args(&line), process), ExitCode::from(want), "{name}");
    }
}

/// A refused command line is reported on stderr, a missing file as an error line there, and a
/// value problem on the configured log.
#[test]
fn refusals_name_their_reason_where_go_wrote_them() {
    let (process_one, outputs) = process(&[], render_scratch);
    run(args(&["-config", "x"]), process_one);
    assert!(
        outputs
            .stderr
            .text()
            .starts_with("bitgauge: -config is not an option; write it as --config\n"),
        "{}",
        outputs.stderr.text()
    );
    let (process_two, outputs) = process(&[], render_scratch);
    run(args(&["--config", &fixture("absent.yaml")]), process_two);
    let text = outputs.stderr.text();
    assert!(
        text.contains("configuration file") && text.contains("not found"),
        "{text}"
    );
    let (process_three, outputs) = process(&[("BITGAUGE_LOG__FORMAT", "json")], render_scratch);
    run(args(&["--config", &fixture("invalid.yaml")]), process_three);
    let lines = outputs.stdout.json_lines();
    assert!(!lines.is_empty(), "{}", outputs.stdout.text());
    assert!(
        lines
            .iter()
            .all(|line| line["message"] == "invalid configuration")
    );
    assert_eq!(lines[0]["key"], "limits.max_streams_per_client");
}

/// QA-127: an invalid YAML file is one diagnostic and exits before serving.
#[test]
fn yaml_failure_is_one_operator_facing_line() {
    let (process, outputs) = process(&[], render_scratch);
    let exit = run(
        args(&["serve", "--config", &fixture("duplicate.yaml.invalid")]),
        process,
    );
    assert_eq!(exit, ExitCode::from(2));
    assert!(outputs.stdout.text().is_empty());
    let text = outputs.stderr.text();
    assert_eq!(text.lines().count(), 1, "{text}");
    assert!(text.contains("duplicate"), "{text}");
    assert!(text.contains("line 4"), "{text}");
    assert!(!text.contains("DuplicateKeyPolicy"), "{text}");
    assert!(!text.contains("display_name: first"), "{text}");
}

/// `-h` and `--help` print the help on stdout and exit 0.
#[test]
fn help_goes_to_stdout_with_exit_zero() {
    for flag in ["-h", "--help"] {
        let (process, outputs) = process(&[], render_scratch);
        assert_eq!(run(args(&[flag]), process), ExitCode::SUCCESS, "{flag}");
        assert!(outputs.stdout.text().contains("Usage: bitgauge"), "{flag}");
        assert_eq!(outputs.stderr.text(), "", "{flag}");
    }
}

/// Runs serve on a free port with JSON logs, waits for its startup line and returns the address
/// it names, the lifecycle that stops it, the logs and the thread that returns its exit status.
fn start_serving(
    environment: &[(&str, &str)],
) -> (String, Lifecycle, Capture, thread::JoinHandle<ExitCode>) {
    let probe = std::net::TcpListener::bind("127.0.0.1:0").expect("a probe listener");
    let free = probe.local_addr().expect("an address").to_string();
    drop(probe);
    let mut environment: Vec<(&str, &str)> = environment.to_vec();
    environment.push(("BITGAUGE_SERVER__LISTEN", &free));
    environment.push(("BITGAUGE_LOG__FORMAT", "json"));
    let (process, outputs) = process(&environment, render_scratch);
    let lifecycle = process.lifecycle.clone();
    let config = fixture("empty.yaml");
    let served = thread::spawn(move || run(args(&["--config", &config]), process));
    for _ in 0..600 {
        let started = outputs
            .stdout
            .text()
            .lines()
            .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .find(|record| record["message"] == "starting");
        if let Some(record) = started {
            let listen = record["listen"]
                .as_str()
                .expect("a listen field")
                .to_owned();
            assert_eq!(
                listen, free,
                "the startup line names the address the listener got"
            );
            return (listen, lifecycle, outputs.stdout, served);
        }
        assert!(
            !served.is_finished(),
            "serve ended: {}",
            outputs.stdout.text()
        );
        thread::sleep(Duration::from_millis(50));
    }
    panic!("no startup line: {}", outputs.stdout.text());
}

/// `GET path` on `address`, the whole answer.
fn get(address: &str, path: &str) -> String {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("a runtime");
    runtime.block_on(async {
        let mut stream = dial_loopback(address.parse().expect("an address")).await;
        let request =
            format!("GET {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n");
        stream.write_all(request.as_bytes()).await.expect("a write");
        let mut answer = Vec::new();
        stream.read_to_end(&mut answer).await.expect("a read");
        String::from_utf8(answer).expect("a text answer")
    })
}

/// Go: `TestServeAndHealthcheck`: the server starts, its startup line names the address the
/// listener got, the health check passes against it, the rendered SPA is mounted, and `stop`
/// ends it with exit status 0.
#[test]
fn serve_and_healthcheck() {
    let (address, lifecycle, logs, served) = start_serving(&[]);
    let mut config = Config::default();
    config.server.listen = address.parse().expect("a listen address");
    assert!(
        crate::healthcheck::answers(&config),
        "the health check of the running server"
    );
    let page = get(&address, "/");
    assert!(page.starts_with("HTTP/1.1 200 OK\r\n"), "{page}");
    assert!(page.contains(r#"src="/assets/index-a1.js""#), "{page}");
    lifecycle.stop();
    assert_eq!(
        served.join().expect("serve did not panic"),
        ExitCode::SUCCESS
    );
    let messages: Vec<_> = logs
        .json_lines()
        .into_iter()
        .map(|record| record["message"].as_str().unwrap_or_default().to_owned())
        .collect();
    for message in ["starting", "configuration", "stopped"] {
        assert!(
            messages.iter().any(|logged| logged == message),
            "{messages:?}"
        );
    }
}

/// Go: `TestServeExitsOneWithoutTheSPA`: a binary built without the web build stops before
/// listening, with exit status 1 and the reason.
#[test]
fn serve_exits_one_without_the_spa() {
    let (process, outputs) = process(
        &[
            ("BITGAUGE_SERVER__LISTEN", "127.0.0.1:1"),
            ("BITGAUGE_LOG__FORMAT", "json"),
        ],
        render_incomplete,
    );
    let code = run(args(&["--config", &fixture("empty.yaml")]), process);
    assert_eq!(code, ExitCode::FAILURE);
    let lines = outputs.stdout.json_lines();
    let rendered = lines
        .iter()
        .find(|record| record["message"] == "render the SPA")
        .expect("the render error");
    assert!(
        rendered["error"]
            .as_str()
            .is_some_and(|error| error.contains("build it with make build")),
        "{rendered}"
    );
    assert!(!lines.iter().any(|record| record["message"] == "starting"));
}

/// A port already taken stops serve with exit status 1 and the listener's error.
#[test]
fn serve_exits_one_when_it_cannot_listen() {
    let taken = std::net::TcpListener::bind("127.0.0.1:0").expect("a listener");
    let address = taken.local_addr().expect("an address").to_string();
    let (process, outputs) = process(
        &[
            ("BITGAUGE_SERVER__LISTEN", &address),
            ("BITGAUGE_LOG__FORMAT", "json"),
        ],
        render_scratch,
    );
    assert_eq!(
        run(args(&["--config", &fixture("empty.yaml")]), process),
        ExitCode::FAILURE
    );
    let lines = outputs.stdout.json_lines();
    let failed = lines
        .iter()
        .find(|record| record["message"] == "listen")
        .expect("the listen error");
    assert_eq!(failed["address"], address.as_str());
}

/// Go: `TestCompatibilityLayersOnTheStartupLine`.
#[test]
fn compatibility_layers_on_the_startup_line() {
    let mut config = Config::default();
    assert_eq!(compatibility_layers(&config), "none");
    config.compat.openspeedtest.enabled = true;
    assert_eq!(compatibility_layers(&config), "openspeedtest");
    config.compat.networkquality.enabled = true;
    assert_eq!(
        compatibility_layers(&config),
        "openspeedtest,networkquality"
    );
}
