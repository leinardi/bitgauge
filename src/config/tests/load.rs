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

//! Loading: defaults, the file, the environment, unknown keys and the value syntax.

use jiff::SignedDuration;

use super::{environment, load, missing_path};
use crate::config::{
    Cidr, Config, DurationRange, LabelRule, Listen, LoadError, Log, Metrics, Origin, Problem, Size,
    Streams, Warmup, load_from, validate,
};

fn cidr(text: &str) -> Cidr {
    text.parse().expect("a CIDR")
}

fn origin(text: &str) -> Origin {
    text.parse().expect("an origin")
}

/// The annotated example of configuration.md section 1, which shows every key at its default.
fn example_yaml() -> String {
    let doc = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/docs/features/configuration.md"
    ))
    .expect("configuration.md");
    let (_, section) = doc
        .split_once("## 1. Config File First")
        .expect("configuration.md has a section 1");
    let (_, fenced) = section
        .split_once("```yaml\n")
        .expect("section 1 has a YAML example");
    let (example, _) = fenced.split_once("```").expect("the example is closed");
    example.to_owned()
}

/// Go: `TestDefaultsEqualTheDocumentedExample`
#[test]
fn defaults_equal_the_documented_example() {
    let loaded = load(&example_yaml(), &[]);
    assert_eq!(loaded.problems, []);
    assert_eq!(loaded.config, Config::default());
}

/// QA-127: syntax errors are one operator-facing line, retaining their source location.
#[test]
fn yaml_diagnostics_are_single_line_without_developer_hints() {
    for yaml in [
        "server:\n  display_name: one\n  display_name: two\n",
        "server: [\n",
        "server: {}\n---\nserver: {}\n",
        "- not\n- a mapping\n",
    ] {
        let source = super::from_text(yaml, &[]).expect_err("invalid YAML configuration");
        let error = crate::config::load::FileError::Yaml(Box::new(source));
        let message = error.to_string();
        assert!(!message.contains('\n'), "{message}");
        assert!(!message.contains("DuplicateKeyPolicy"), "{message}");
        assert!(!message.contains("from_str_multiple"), "{message}");
        assert!(!message.contains("display_name: one"), "{message}");
        assert!(!message.is_empty(), "diagnostic must explain the failure");
    }
}

/// Go: `TestNoFileNoEnvironmentGivesDefaults`
#[test]
fn no_file_no_environment_gives_defaults() {
    let loaded = load_from(&missing_path(), false, &[]).expect("a missing default path");
    assert_eq!(loaded.config, Config::default());
    assert_eq!(loaded.problems, []);
}

/// Go: `TestDefaultsAreTheDocumentedValues`
#[test]
fn defaults_are_the_documented_values() {
    let defaults = Config::default();
    assert_eq!(defaults.server.listen.to_string(), ":8080");
    assert_eq!(defaults.server.base_path, "/");
    assert_eq!(defaults.server.display_name, "BitGauge");
    assert_eq!(defaults.limits.max_download_bytes, Size::new(268_435_456));
    assert_eq!(defaults.limits.max_upload_bytes, Size::new(268_435_456));
    assert_eq!(defaults.limits.max_streams_per_client, 8);
    assert_eq!(defaults.limits.requests_per_minute, 1200);
    assert_eq!(defaults.limits.tracked_clients, 4096);
    assert_eq!(defaults.test_defaults.preset, "standard");
    assert_eq!(
        defaults.test_defaults.phases,
        ["idle", "download", "upload"]
    );
    assert_eq!(
        defaults.test_defaults.streams,
        Streams {
            mode: String::new(),
            fixed: 3,
            max: 6
        }
    );
    assert_eq!(defaults.test_defaults.download, DurationRange::default());
    assert_eq!(defaults.test_defaults.upload, DurationRange::default());
    assert_eq!(defaults.test_defaults.data_cap, Size::new(0));
    assert_eq!(defaults.test_defaults.units, "bits");
    assert_eq!(defaults.test_defaults.warmup, Warmup::Auto);
    assert_eq!(defaults.test_defaults.ping_count, 0);
    assert!(defaults.test_defaults.overhead_compensation_percent.abs() < f64::EPSILON);
    assert_eq!(
        defaults.compat.networkquality.max_upload_bytes,
        Size::new(17_179_869_184)
    );
    assert_eq!(defaults.compat.networkquality.max_flows_per_client, 32);
    assert_eq!(
        defaults.log,
        Log {
            format: "text".to_owned(),
            level: "info".to_owned()
        }
    );
    assert_eq!(
        defaults.metrics,
        Metrics {
            enabled: false,
            path: "/metrics".to_owned()
        }
    );
    assert!(
        !defaults.compat.openspeedtest.enabled
            && !defaults.compat.librespeed.enabled
            && !defaults.compat.networkquality.enabled,
        "a compatibility layer is on by default"
    );
}

/// Go: `TestEnvironmentMapping`, the table of configuration-security.md section 1.
#[test]
fn environment_mapping() {
    let loaded = load_from(
        &missing_path(),
        false,
        &environment(&[
            "BITGAUGE_SERVER__LISTEN=:9090",
            "BITGAUGE_SERVER__TRUSTED_PROXIES=172.30.0.2/32,fd00::2/128",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=512MiB",
            "BITGAUGE_TEST_DEFAULTS__STREAMS__MAX=4",
            "BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true",
            "BITGAUGE_SERVICE_HOST=10.43.0.12",
            "BITGAUGE_PORT=tcp://10.43.0.12:8080",
            "HOME=/root",
        ]),
    )
    .expect("loads");

    let mut want = Config::default();
    want.server.listen.port = 9090;
    want.server.trusted_proxies = vec![cidr("172.30.0.2/32"), cidr("fd00::2/128")];
    want.limits.max_upload_bytes = Size::new(536_870_912);
    want.test_defaults.streams.max = 4;
    want.compat.networkquality.enabled = true;
    assert_eq!(loaded.config, want);
    assert_eq!(loaded.problems, []);
    assert_eq!(
        loaded.ignored_env,
        ["BITGAUGE_PORT", "BITGAUGE_SERVICE_HOST"]
    );
}

/// Go: `TestPrecedence`
#[test]
fn precedence() {
    let file = "
server:
  display_name: home
  base_path: /speed
limits:
  max_streams_per_client: 16
";

    // The file overrides only the keys it sets.
    let mut want = Config::default();
    want.server.display_name = "home".to_owned();
    want.server.base_path = "/speed".to_owned();
    want.limits.max_streams_per_client = 16;
    assert_eq!(load(file, &[]).config, want);

    // The environment overrides the file.
    let config = load(file, &["BITGAUGE_SERVER__DISPLAY_NAME=lab"]).config;
    assert_eq!(
        (
            config.server.display_name.as_str(),
            config.server.base_path.as_str()
        ),
        ("lab", "/speed")
    );

    // The environment overrides a default the file leaves alone.
    let config = load(
        file,
        &["BITGAUGE_LOG__LEVEL=debug", "BITGAUGE_LOG__FORMAT=json"],
    )
    .config;
    assert_eq!(
        config.log,
        Log {
            format: "json".to_owned(),
            level: "debug".to_owned()
        }
    );
    assert_eq!(config.server.display_name, "home");

    // An empty list variable clears the list.
    let config = load(file, &["BITGAUGE_TEST_DEFAULTS__PHASES="]).config;
    assert!(config.test_defaults.phases.is_empty());

    // A comma list keeps its order and trims spaces.
    let config = load(
        file,
        &[
            "BITGAUGE_TEST_DEFAULTS__PHASES=upload, download",
            "BITGAUGE_SERVER__CORS__ALLOWED_ORIGINS=https://a.lan,http://b.lan:8080",
        ],
    )
    .config;
    assert_eq!(config.test_defaults.phases, ["upload", "download"]);
    assert_eq!(
        config.server.cors.allowed_origins,
        [origin("https://a.lan"), origin("http://b.lan:8080")]
    );
}

/// Go: `TestFileLists`
#[test]
fn file_lists() {
    let config = load(
        r#"
server:
  trusted_proxies: ["10.0.0.0/8", "::1/128"]
  cors:
    allowed_origins: [https://speed.example.lan]
test_defaults:
  phases: [download]
"#,
        &[],
    )
    .config;
    assert_eq!(
        config.server.trusted_proxies,
        [cidr("10.0.0.0/8"), cidr("::1/128")]
    );
    assert_eq!(
        config.server.cors.allowed_origins,
        [origin("https://speed.example.lan")]
    );
    assert_eq!(config.test_defaults.phases, ["download"]);
}

/// Go: `TestFilePaths`. A file the Go test wrote is the file's text here; the paths themselves
/// are a missing one, a directory and the documentation's own file.
#[test]
fn file_paths() {
    assert!(matches!(
        load_from(&missing_path(), true, &[]),
        Err(LoadError::FileNotFound { .. })
    ));
    assert!(load_from(&missing_path(), false, &[]).is_ok());
    assert!(matches!(
        load_from(&std::env::temp_dir(), true, &[]),
        Err(LoadError::File { .. })
    ));
    let readme = concat!(env!("CARGO_MANIFEST_DIR"), "/README.md");
    assert!(
        matches!(
            load_from(readme.as_ref(), true, &[]),
            Err(LoadError::File { .. })
        ),
        "a file that is not YAML"
    );

    for invalid in [
        "server: [unclosed",
        "server:\n  listen: \":1\"\n  listen: \":2\"\n",
        "- a list\n",
        "just text\n",
    ] {
        assert!(
            super::from_text(invalid, &[]).is_err(),
            "{invalid:?} must not load"
        );
    }
    for empty in ["", "# only a comment\n", "~\n", "{}\n"] {
        assert_eq!(
            load(empty, &[]).config,
            Config::default(),
            "{empty:?} is the defaults"
        );
    }
}

/// Loads a configuration that must read fine but fail to decode, and returns its problems.
fn load_problems(file: &str, entries: &[&str]) -> Vec<Problem> {
    let loaded = load(file, entries);
    assert!(
        !loaded.problems.is_empty(),
        "no problem reported; decoded {:?}",
        loaded.config
    );
    loaded.problems
}

/// Go: `TestUnknownKeysAreErrors`
#[test]
fn unknown_keys_are_errors() {
    for (name, file, entries, key) in [
        (
            "misspelled key in the file",
            "server:\n  lisen: \":8080\"\n",
            &[][..],
            "server.lisen",
        ),
        (
            "unknown section in the file",
            "storage:\n  path: /data\n",
            &[],
            "storage",
        ),
        (
            "key with the wrong case in the file",
            "Server:\n  listen: \":8080\"\n",
            &[],
            "Server",
        ),
        (
            "misspelled key in the environment",
            "",
            &["BITGAUGE_SERVER__LISTN=:8080"],
            "server.listn",
        ),
        (
            "unknown section in the environment",
            "",
            &["BITGAUGE_STORAGE__PATH=/data"],
            "storage",
        ),
        (
            "a level below a value in the environment",
            "",
            &["BITGAUGE_LOG__LEVEL__X=debug"],
            "log.level",
        ),
        (
            "listen given as its fields",
            "server:\n  listen: {Host: 0.0.0.0, Port: 9090}\n",
            &[],
            "server.listen",
        ),
        (
            "warm-up given as its fields",
            "test_defaults:\n  warmup: {Auto: true, Duration: 3000000000}\n",
            &[],
            "test_defaults.warmup",
        ),
        (
            "duration given as its fields",
            "test_defaults:\n  download:\n    min_duration: {Duration: 5, Set: true}\n",
            &[],
            "test_defaults.download.min_duration",
        ),
        // A name with a dot is one key at its level, never the path it looks like.
        (
            "a dotted key at the top",
            "\"server.listen\": \":9999\"\n",
            &[],
            "server.listen",
        ),
        (
            "a dotted key inside a section",
            "server:\n  \"cors.allowed_origins\": [https://a.lan]\n",
            &[],
            "server.cors.allowed_origins",
        ),
        (
            "a dotted section name",
            "\"server.cors\":\n  allowed_origins: [https://a.lan]\n",
            &[],
            "server.cors",
        ),
        (
            "CIDR given as a map",
            "server:\n  trusted_proxies: [{addr: 10.0.0.0, bits: 8}]\n",
            &[],
            "server.trusted_proxies[0]",
        ),
    ] {
        let problems = load_problems(file, entries);
        assert!(
            problems.len() == 1 && problems[0].key == key && !problems[0].rule.is_empty(),
            "{name}: problems = {problems:?}, want one for {key}"
        );
    }
}

/// Go: `TestUnknownKeyBesideADecodeError`
#[test]
fn unknown_key_beside_a_decode_error() {
    for (file, unknown, bad) in [
        (
            "server:\n  lisen: \":8080\"\n  trusted_proxies: [10.0.0.0/33]\n",
            "server.lisen",
            "server.trusted_proxies[0]",
        ),
        (
            "server:\n  labels:\n    - {cidr: 10.0.0.0/33, lable: VPN}\n",
            "server.labels[0].lable",
            "server.labels[0].cidr",
        ),
    ] {
        let problems = load_problems(file, &[]);
        let rule = |key: &str| {
            problems
                .iter()
                .find(|problem| problem.key == key)
                .map(|problem| problem.rule.as_str())
        };
        assert_eq!(problems.len(), 2, "{file:?}: {problems:?}");
        assert!(
            rule(bad).is_some_and(|rule| !rule.is_empty()),
            "{problems:?}"
        );
        assert_eq!(
            rule(unknown),
            Some("unknown key (configuration.md section 2 lists every key)")
        );
    }
}

/// Go: `TestEveryDecodeErrorIsReported`
#[test]
fn every_decode_error_is_reported() {
    let problems = load_problems(
        "limits:\n  max_streams_per_client: abc\n  requests_per_minute: xyz\n\
         server:\n  trusted_proxies: [10.0.0.0/33]\n",
        &[],
    );
    assert_eq!(
        super::problem_keys(&problems),
        [
            "limits.max_streams_per_client",
            "limits.requests_per_minute",
            "server.trusted_proxies[0]"
        ]
    );
}

/// Go: `TestEnvironmentListItemReportsItsValue`
#[test]
fn environment_list_item_reports_its_value() {
    let problems = load_problems("", &["BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.0/33"]);
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert_eq!(problems[0].key, "server.trusted_proxies[0]");
    assert_eq!(problems[0].value, "10.0.0.0/33");
}

/// Go: `TestValueSyntax`
#[test]
#[expect(clippy::too_many_lines, reason = "one row per Go case")]
fn value_syntax() {
    type Check = fn(&Config) -> bool;
    let checks: &[(&str, Check)] = &[
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1048576", |config| {
            config.limits.max_upload_bytes == Size::new(1_048_576)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=64KiB", |config| {
            config.limits.max_upload_bytes == Size::new(65_536)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=4GiB", |config| {
            config.limits.max_upload_bytes == Size::new(4_294_967_296)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=64kB", |config| {
            config.limits.max_upload_bytes == Size::new(64_000)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=30MB", |config| {
            config.limits.max_upload_bytes == Size::new(30_000_000)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=2GB", |config| {
            config.limits.max_upload_bytes == Size::new(2_000_000_000)
        }),
        ("BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1.5GiB", |config| {
            config.limits.max_upload_bytes == Size::new(1_610_612_736)
        }),
        ("BITGAUGE_TEST_DEFAULTS__DATA_CAP=0", |config| {
            config.test_defaults.data_cap == Size::new(0)
        }),
        (
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=500ms",
            |config| {
                config.test_defaults.download.min_duration == Some(SignedDuration::from_millis(500))
            },
        ),
        (
            "BITGAUGE_TEST_DEFAULTS__UPLOAD__MAX_DURATION=30s",
            |config| {
                config.test_defaults.upload.max_duration == Some(SignedDuration::from_secs(30))
            },
        ),
        (
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MAX_DURATION=2m",
            |config| {
                config.test_defaults.download.max_duration == Some(SignedDuration::from_secs(120))
            },
        ),
        (
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=",
            |config| config.test_defaults.download.min_duration.is_none(),
        ),
        ("BITGAUGE_TEST_DEFAULTS__WARMUP=3s", |config| {
            config.test_defaults.warmup == Warmup::Fixed(SignedDuration::from_secs(3))
        }),
        ("BITGAUGE_TEST_DEFAULTS__WARMUP=auto", |config| {
            config.test_defaults.warmup == Warmup::Auto
        }),
        (
            "BITGAUGE_SERVER__LABELS=10.8.0.0/24=VPN, fd7a:115c:a1e0::/48 = Tailscale ,10.9.0.0/24=a=b",
            |config| {
                config.server.labels
                    == [
                        LabelRule {
                            cidr: Some(cidr("10.8.0.0/24")),
                            label: "VPN".to_owned(),
                        },
                        LabelRule {
                            cidr: Some(cidr("fd7a:115c:a1e0::/48")),
                            label: "Tailscale".to_owned(),
                        },
                        LabelRule {
                            cidr: Some(cidr("10.9.0.0/24")),
                            label: "a=b".to_owned(),
                        },
                    ]
            },
        ),
        ("BITGAUGE_SERVER__LABELS=", |config| {
            config.server.labels.is_empty()
        }),
        ("BITGAUGE_SERVER__LISTEN=127.0.0.1:18080", |config| {
            config.server.listen
                == Listen {
                    host: "127.0.0.1".to_owned(),
                    port: 18080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=[::1]:8080", |config| {
            config.server.listen
                == Listen {
                    host: "::1".to_owned(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=:8080", |config| {
            config.server.listen
                == Listen {
                    host: String::new(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=0.0.0.0:8080", |config| {
            config.server.listen
                == Listen {
                    host: "0.0.0.0".to_owned(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=[::]:8080", |config| {
            config.server.listen
                == Listen {
                    host: "::".to_owned(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=127.0.0.1:8080", |config| {
            config.server.listen
                == Listen {
                    host: "127.0.0.1".to_owned(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_SERVER__LISTEN=[fe80::1%eth0]:8080", |config| {
            config.server.listen
                == Listen {
                    host: "fe80::1%eth0".to_owned(),
                    port: 8080,
                }
        }),
        ("BITGAUGE_METRICS__ENABLED=false", |config| {
            !config.metrics.enabled
        }),
        ("BITGAUGE_METRICS__ENABLED=true", |config| {
            config.metrics.enabled
        }),
        (
            "BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=5.13",
            |config| {
                (config.test_defaults.overhead_compensation_percent - 5.13).abs() < f64::EPSILON
            },
        ),
        ("BITGAUGE_TEST_DEFAULTS__PRESET=continuous", |config| {
            config.test_defaults.preset == "continuous" && validate(config).is_empty()
        }),
        (
            "BITGAUGE_SERVER__PUBLIC_URL=https://speed.example.lan",
            |config| config.server.public_url == origin("https://speed.example.lan"),
        ),
        // Rust implementation: jiff's friendly syntax (rust-port.md, row 3).
        (
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MAX_DURATION=1m30s",
            |config| {
                config.test_defaults.download.max_duration == Some(SignedDuration::from_secs(90))
            },
        ),
        (
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MAX_DURATION=1 minute",
            |config| {
                config.test_defaults.download.max_duration == Some(SignedDuration::from_secs(60))
            },
        ),
    ];
    for &(entry, check) in checks {
        let loaded = load("", &[entry]);
        assert_eq!(loaded.problems, [], "{entry}");
        assert!(
            check(&loaded.config),
            "{entry} decoded to {:?}",
            loaded.config
        );
    }
}

/// Go: `TestFileValueSyntax`
#[test]
fn file_value_syntax() {
    let loaded = load(
        r#"
limits:
  max_download_bytes: 1048576
  max_upload_bytes: 512MiB
  max_streams_per_client: 8.0
  requests_per_minute: "600"
test_defaults:
  data_cap: 100MB
  overhead_compensation_percent: 6
  warmup: 2s
  download:
    min_duration: 8s
    max_duration: ""
compat:
  librespeed:
    enabled: true
"#,
        &[],
    );
    assert_eq!(loaded.problems, []);
    let config = loaded.config;
    assert_eq!(config.limits.max_download_bytes, Size::new(1_048_576));
    assert_eq!(config.limits.max_upload_bytes, Size::MIB.times(512));
    assert_eq!(
        config.limits.max_streams_per_client, 8,
        "a whole float is an integer"
    );
    assert_eq!(
        config.limits.requests_per_minute, 600,
        "quoted digits are an integer"
    );
    assert_eq!(config.test_defaults.data_cap, Size::new(100_000_000));
    assert!((config.test_defaults.overhead_compensation_percent - 6.0).abs() < f64::EPSILON);
    assert_eq!(
        config.test_defaults.warmup,
        Warmup::Fixed(SignedDuration::from_secs(2))
    );
    assert_eq!(
        config.test_defaults.download,
        DurationRange {
            min_duration: Some(SignedDuration::from_secs(8)),
            max_duration: None
        }
    );
    assert!(config.compat.librespeed.enabled);
}

/// Go: `TestInvalidValues`
#[test]
#[expect(clippy::too_many_lines, reason = "one row per Go case")]
fn invalid_values() {
    let cases: &[(&str, &str, &str)] = &[
        (
            "size in words",
            "limits:\n  max_upload_bytes: 256 megs\n",
            "",
        ),
        (
            "size with a space",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=256 MiB",
        ),
        (
            "size with an unknown unit",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1KB",
        ),
        (
            "size with a lower-case binary unit",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1kib",
        ),
        ("negative size", "", "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=-1"),
        (
            "negative size in the file",
            "test_defaults:\n  data_cap: -1\n",
            "",
        ),
        (
            "fractional byte count",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1.5",
        ),
        (
            "fractional byte count in the file",
            "limits:\n  max_upload_bytes: 1.5\n",
            "",
        ),
        (
            "size that is not whole bytes",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=0.0001kB",
        ),
        (
            "unit without a number",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=MiB",
        ),
        (
            "size overflow",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=10000000000GiB",
        ),
        (
            "byte count overflow",
            "",
            "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=9223372036854775808",
        ),
        ("empty size", "", "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES="),
        (
            "duration without a unit",
            "",
            "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=10",
        ),
        (
            "duration in words",
            "test_defaults:\n  upload:\n    max_duration: ten seconds\n",
            "",
        ),
        (
            "warm-up with a capital",
            "",
            "BITGAUGE_TEST_DEFAULTS__WARMUP=Auto",
        ),
        ("empty warm-up", "", "BITGAUGE_TEST_DEFAULTS__WARMUP="),
        ("listen without a colon", "", "BITGAUGE_SERVER__LISTEN=8080"),
        (
            "listen with a named port",
            "",
            "BITGAUGE_SERVER__LISTEN=:http",
        ),
        (
            "listen on a host name",
            "",
            "BITGAUGE_SERVER__LISTEN=localhost:8080",
        ),
        (
            "listen on a domain name",
            "",
            "BITGAUGE_SERVER__LISTEN=speed.lan:80",
        ),
        (
            "integer with a fraction",
            "",
            "BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT=8.5",
        ),
        (
            "integer with a fraction in the file",
            "limits:\n  max_streams_per_client: 8.5\n",
            "",
        ),
        (
            "integer in words",
            "limits:\n  max_streams_per_client: eight\n",
            "",
        ),
        ("boolean in words", "", "BITGAUGE_METRICS__ENABLED=yes"),
        (
            "boolean in words in the file",
            "metrics:\n  enabled: \"on\"\n",
            "",
        ),
        ("plain yes in the file", "metrics:\n  enabled: yes\n", ""),
        (
            "CIDR without a prefix length",
            "",
            "BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.1",
        ),
        (
            "CIDR out of range",
            "server:\n  trusted_proxies: [10.0.0.0/33]\n",
            "",
        ),
        (
            "CIDR with a leading zero",
            "server:\n  trusted_proxies: [10.0.0.0/08]\n",
            "",
        ),
        (
            "CIDR with a zone",
            "server:\n  trusted_proxies: [\"fe80::/64%eth0\"]\n",
            "",
        ),
        (
            "host name as a CIDR",
            "server:\n  trusted_proxies: [proxy.lan]\n",
            "",
        ),
        (
            "empty CIDR in a list",
            "",
            "BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.0/8,,fd00::/8",
        ),
        (
            "list given as a scalar in the file",
            "server:\n  trusted_proxies: 10.0.0.0/8\n",
            "",
        ),
        (
            "origin that is not a URL",
            "",
            "BITGAUGE_SERVER__PUBLIC_URL=http://[::1",
        ),
        ("boolean as a digit", "", "BITGAUGE_METRICS__ENABLED=1"),
        (
            "boolean in capitals",
            "",
            "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=TRUE",
        ),
        (
            "boolean as a letter",
            "",
            "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=t",
        ),
        (
            "NaN percent",
            "",
            "BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=NaN",
        ),
        (
            "infinite percent",
            "",
            "BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=+Inf",
        ),
        (
            "NaN percent in the file",
            "test_defaults:\n  overhead_compensation_percent: .nan\n",
            "",
        ),
        (
            "infinite percent in the file",
            "test_defaults:\n  overhead_compensation_percent: .inf\n",
            "",
        ),
        (
            "infinite integer in the file",
            "limits:\n  tracked_clients: -.inf\n",
            "",
        ),
        (
            "size of 2^63 bytes in the file",
            "limits:\n  max_upload_bytes: 9.223372036854775808e18\n",
            "",
        ),
        (
            "integer above int64 in the file",
            "limits:\n  tracked_clients: 18446744073709551615\n",
            "",
        ),
        (
            "section without a value",
            "server:\n  # listen: \":8080\"\n",
            "",
        ),
        ("key without a value", "server:\n  display_name:\n", ""),
        ("explicit null", "log:\n  level: null\n", ""),
        ("null list element", "server:\n  trusted_proxies: [~]\n", ""),
        (
            "null origin in a list",
            "server:\n  cors:\n    allowed_origins: [~]\n",
            "",
        ),
        (
            "null phase in a list",
            "test_defaults:\n  phases: [idle, ~]\n",
            "",
        ),
        ("number for a text key", "server:\n  public_url: 5\n", ""),
        (
            "number for a plain text key",
            "server:\n  display_name: 5\n",
            "",
        ),
        ("section given as a scalar", "server: 5\n", ""),
    ];
    for &(name, file, entry) in cases {
        let entries: Vec<&str> = [entry]
            .into_iter()
            .filter(|entry| !entry.is_empty())
            .collect();
        for problem in load_problems(file, &entries) {
            assert!(
                !problem.key.is_empty() && !problem.rule.is_empty(),
                "{name}: problem without a key or a rule: {problem:?}"
            );
        }
    }
}

/// Problems found in the file keep where the file wrote the value; validation and the
/// environment have no location (no Go test: Go kept none).
#[test]
fn file_problems_keep_their_location() {
    let loaded = load(
        "server:\n  listen: \"8080\"\n  lisen: x\n  trusted_proxies: [10.0.0.0/8, bad]\nlog:\n  level:\n",
        &["BITGAUGE_LIMITS__TRACKED_CLIENTS=abc"],
    );
    let lines: Vec<(&str, Option<u64>)> = loaded
        .problems
        .iter()
        .map(|problem| {
            (
                problem.key.as_str(),
                problem.location.map(|location| location.line),
            )
        })
        .collect();
    assert_eq!(
        lines,
        [
            ("limits.tracked_clients", None),
            ("log.level", Some(6)),
            ("server.lisen", Some(3)),
            ("server.listen", Some(2)),
            ("server.trusted_proxies[1]", Some(4)),
        ]
    );
    assert!(
        super::check(&load("server:\n  listen: \":0\"\n", &[]))
            .iter()
            .all(|problem| problem.location.is_none()),
        "a validation problem has no location"
    );
}
