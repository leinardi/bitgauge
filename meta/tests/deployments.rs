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

//! The deployment examples in `deployments/examples` stay runnable as documented: the tree holds
//! only the files checked here; every compose file parses and hardens BitGauge as
//! `docs/features/deployment-example.md` does, with the image's healthcheck timings; every
//! compose environment passes the `bitgauge` configuration loader and validator; each proxy is the
//! one trusted proxy; and the repository README's compose block is the shipped file. It reads
//! files only; nothing here runs a container.
//!
//! The port of `test/deployments/deployments_test.go`. The configuration goes through the Rust
//! loader ([`bitgauge::config::load_from`] and [`bitgauge::config::check`]); only whether a
//! problem is found is asserted, so the problem wording, which may be Rust's for
//! library-originated texts (`docs/rust-port.md`, Intended Differences from Go, row 4), does not
//! matter. No example sets a duration (row 3).

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use meta::repo;
use meta::transition::SHIPPED_DOCKERFILE;
use regex::Regex;
use serde_json::{Map, Value};

const EXAMPLES_DIR: &str = "deployments/examples";
const EXAMPLE_DOC: &str = "docs/features/deployment-example.md";
/// How a page under `docs/features` links a shipped example file.
const EXAMPLE_LINK_PREFIX: &str = "../../deployments/examples/";
/// The release tag the examples pin: the latest 0.x (release.md).
const IMAGE: &str = "ghcr.io/leinardi/bitgauge:0";
/// The one port BitGauge listens on in every example (the image's EXPOSE).
const PORT: &str = "8080";
/// BitGauge's service name in every compose file, which the proxies address.
const SERVICE: &str = "bitgauge";

/// The proxies' own configuration files.
const PROXY_FILES: [&str; 3] = [
    "traefik/traefik-dynamic.yaml",
    "caddy/Caddyfile",
    "nginx/bitgauge.conf",
];
/// Every example's compose file, the one without a proxy first.
const COMPOSE_FILES: [&str; 4] = [
    "compose-alone/compose.yaml",
    "traefik/compose.yaml",
    "caddy/compose.yaml",
    "nginx/compose.yaml",
];
/// The lines that send each proxy to BitGauge on its port.
const PROXY_TARGETS: [(&str, &str); 2] = [
    ("caddy/Caddyfile", "reverse_proxy bitgauge:8080 {"),
    ("nginx/bitgauge.conf", "proxy_pass http://bitgauge:8080;"),
];

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

static HEALTHCHECK_RULE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"HEALTHCHECK --interval=(\S+) --timeout=(\S+) --start-period=(\S+) --retries=(\d+)")
});
static FENCE_LINE: LazyLock<Regex> = LazyLock::new(|| pattern("^```"));

/// The parent directory of a slash-separated path, `.` for none, as Go's `path.Dir`.
fn parent(relative: &str) -> &str {
    relative
        .rsplit_once('/')
        .map_or(".", |(directory, _)| directory)
}

/// Every non-directory entry under `directory`, symbolic links included, relative to it.
fn entries_under(directory: &Path) -> Vec<String> {
    let mut found = Vec::new();
    let mut pending = vec![(directory.to_owned(), String::new())];
    while let Some((current, prefix)) = pending.pop() {
        let entries = fs::read_dir(&current)
            .unwrap_or_else(|error| panic!("list {}: {error}", current.display()));
        for entry in entries {
            let entry = entry.unwrap_or_else(|error| panic!("list {}: {error}", current.display()));
            let name = format!("{prefix}{}", entry.file_name().to_string_lossy());
            let kind = entry
                .file_type()
                .unwrap_or_else(|error| panic!("inspect {name}: {error}"));
            if kind.is_dir() {
                pending.push((entry.path(), format!("{name}/")));
            } else {
                found.push(name);
            }
        }
    }
    found
}

/// Go: `TestExamplesAreTheListedFiles`. Each example directory holds its README and the files this
/// test knows, so a new file cannot ship unchecked.
#[test]
fn examples_are_the_listed_files() {
    let mut want = BTreeSet::new();
    for relative in PROXY_FILES.iter().chain(&COMPOSE_FILES) {
        want.insert((*relative).to_owned());
        want.insert(format!("{}/README.md", parent(relative)));
    }
    let got: BTreeSet<String> = entries_under(&repo::path(EXAMPLES_DIR))
        .into_iter()
        .collect();
    let mut problems: Vec<String> = got
        .difference(&want)
        .map(|relative| format!("{EXAMPLES_DIR}/{relative} is not a file this test checks"))
        .collect();
    problems.extend(
        want.difference(&got)
            .map(|relative| format!("{EXAMPLES_DIR}/{relative} is missing")),
    );
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestReadmesLinkTheSpec`. Every example's README links a section of the page it comes from.
#[test]
fn readmes_link_the_spec() {
    let link = format!("](../../../{EXAMPLE_DOC}#");
    let problems: Vec<String> = COMPOSE_FILES
        .iter()
        .map(|relative| format!("{EXAMPLES_DIR}/{}/README.md", parent(relative)))
        .filter(|readme| !repo::read(readme).contains(&link))
        .map(|readme| format!("{readme} does not link a section of {EXAMPLE_DOC}"))
        .collect();
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestComposeFilesHardenBitGauge`. BitGauge's service in every compose file is held to
/// deployment-example.md section 1, with the image's healthcheck timings.
#[test]
fn compose_files_harden_bit_gauge() {
    let timings = image_timings();
    let mut problems = Vec::new();
    for relative in COMPOSE_FILES {
        let content = repo::read(&format!("{EXAMPLES_DIR}/{relative}"));
        problems.extend(
            hardening_problems(&content, &timings)
                .into_iter()
                .map(|problem| format!("{EXAMPLES_DIR}/{relative}: {problem}")),
        );
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestHardeningProblemsCatchesWeakenedFiles`. Negative control: the hardening check finds
/// nothing in the shipped file and a problem in each weakened copy of it.
#[test]
fn hardening_problems_catches_weakened_files() {
    let timings = image_timings();
    let good = repo::read(&format!("{EXAMPLES_DIR}/compose-alone/compose.yaml"));
    let problems = hardening_problems(&good, &timings);
    assert!(
        problems.is_empty(),
        "the shipped file has problems {problems:?}"
    );

    let edits = [
        ("writable root", "read_only: true", "read_only: false"),
        (
            "capabilities kept",
            "cap_drop: [ALL]",
            "cap_drop: [NET_RAW]",
        ),
        (
            "privileges gained",
            "no-new-privileges:true",
            "seccomp:unconfined",
        ),
        ("another image", IMAGE, "ghcr.io/leinardi/bitgauge:latest"),
        (
            "shell healthcheck",
            r#"["CMD", "/bitgauge", "healthcheck"]"#,
            r#"["CMD-SHELL", "/bitgauge healthcheck"]"#,
        ),
        ("faster interval", "interval: 30s", "interval: 10s"),
        ("fewer retries", "retries: 3", "retries: 1"),
        ("another port", r#""8080:8080""#, r#""8080:9090""#),
        (
            "a volume",
            "    # volumes:\n    #   -",
            "    volumes:\n      -",
        ),
    ];
    let mut blind = Vec::new();
    for (name, from, to) in edits {
        let weakened = good.replacen(from, to, 1);
        assert_ne!(
            weakened, good,
            "{name}: {from:?} is not in the shipped file"
        );
        if hardening_problems(&weakened, &timings).is_empty() {
            blind.push(format!("{name}: no problem found"));
        }
    }
    assert!(blind.is_empty(), "{}", blind.join("\n"));
}

/// Go: `TestComposeEnvironmentsValidate`. Each compose file's BitGauge environment loads through
/// the configuration loader with no problem, so an example cannot set a key this release rejects
/// at startup (configuration.md section 4, exit status 2).
#[test]
fn compose_environments_validate() {
    let mut problems = Vec::new();
    for relative in COMPOSE_FILES {
        let file = parse_compose(relative);
        let environment = field(service_of(&file), "environment");
        problems.extend(
            config_problems(object(environment))
                .into_iter()
                .map(|problem| {
                    format!("{EXAMPLES_DIR}/{relative}: BitGauge would exit 2: {problem}")
                }),
        );
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestConfigProblemsIsNotBlind`. Negative control: the check above reaches the validator,
/// so a layer toggle that breaks a conflict rule, a key that does not exist and an invalid value
/// are all refused.
#[test]
fn config_problems_is_not_blind() {
    let cases = [
        (
            "a layer without its https origin",
            "BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED",
            "true",
        ),
        ("an unknown key", "BITGAUGE_SERVER__NO_SUCH_KEY", "1"),
        (
            "an invalid value",
            "BITGAUGE_SERVER__PUBLIC_URL",
            "speed.example.lan",
        ),
    ];
    let mut blind = Vec::new();
    for (name, key, value) in cases {
        let mut environment = Map::new();
        environment.insert(key.to_owned(), Value::String(value.to_owned()));
        if config_problems(Some(&environment)).is_empty() {
            blind.push(format!("{name}: no problem found"));
        }
    }
    assert!(blind.is_empty(), "{}", blind.join("\n"));
}

/// Loads a compose environment as BitGauge would, with no configuration file, and returns every
/// decode and validation problem.
fn config_problems(environment: Option<&Map<String, Value>>) -> Vec<String> {
    let pairs: Vec<(String, String)> = environment
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), text(Some(value))))
        .collect();
    let scratch = tempfile::tempdir().unwrap_or_else(|error| panic!("scratch dir: {error}"));
    let loaded = bitgauge::config::load_from(&scratch.path().join("absent.yaml"), false, &pairs)
        .unwrap_or_else(|error| panic!("load {pairs:?}: {error}"));
    bitgauge::config::check(&loaded)
        .into_iter()
        .map(|problem| format!("{}={}: {}", problem.key, problem.value, problem.rule))
        .collect()
}

/// Go: `TestProxiesTrustOnlyThemselves`. Each proxy reaches BitGauge on its port and is the one
/// trusted proxy, at the fixed address its compose file gives it (security.md section 4).
#[test]
fn proxies_trust_only_themselves() {
    let mut problems = Vec::new();
    for (relative, target) in PROXY_TARGETS {
        if !contains_trimmed_line(&repo::read(&format!("{EXAMPLES_DIR}/{relative}")), target) {
            problems.push(format!(
                "{EXAMPLES_DIR}/{relative} does not proxy to {SERVICE}:{PORT}"
            ));
        }
    }

    for relative in &COMPOSE_FILES[1..] {
        let file = parse_compose(relative);
        let trusted = text(field(
            field(service_of(&file), "environment"),
            "BITGAUGE_SERVER__TRUSTED_PROXIES",
        ));
        let mut proxies = 0;
        for (name, raw) in object(field(Some(&file), "services")).into_iter().flatten() {
            if name == SERVICE {
                continue;
            }
            proxies += 1;
            let address = proxy_address(raw);
            let want = format!("{address}/32");
            if address.is_empty() || trusted != want {
                problems.push(format!(
                    "{relative}: trusted_proxies is {trusted:?}, want {want:?}, the {name} address"
                ));
            }
        }
        if proxies != 1 {
            problems.push(format!(
                "{relative} has {proxies} services besides {SERVICE}, want its one proxy"
            ));
        }
    }

    let traefik = parse_compose("traefik/compose.yaml");
    let got = field(
        field(service_of(&traefik), "labels"),
        "traefik.http.services.bitgauge.loadbalancer.server.port",
    );
    if got.and_then(Value::as_str) != Some(PORT) {
        problems.push(format!(
            "traefik/compose.yaml sends Traefik to port {}, want {PORT}",
            text(got)
        ));
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestReadmeShowsTheShippedCompose`. The repository README's compose example is the shipped
/// compose-alone file, so the first example a reader copies is the hardened one.
#[test]
fn readme_shows_the_shipped_compose() {
    const README: &str = "README.md";
    let prefix = format!("{EXAMPLES_DIR}/");
    let (blocks, mut problems) = linked_blocks(&repo::read(README), &prefix);
    problems = problems
        .into_iter()
        .map(|problem| format!("{README}: {problem}"))
        .collect();
    let want = format!("{prefix}compose-alone/compose.yaml");
    match blocks.as_slice() {
        [only] if only.link == want => {
            if only.body != repo::read(&want) {
                problems.push(format!(
                    "{README}:{}: the block differs from {want}",
                    only.line
                ));
            }
        }
        _ => problems.push(format!(
            "{README} shows {blocks:?}, want one block linked to {want}"
        )),
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestLinkedBlocksIsNotBlind`. Negative control: the block reader on a scratch page finds
/// the one linked block and reports a paragraph linking two files and a block left open.
#[test]
fn linked_blocks_is_not_blind() {
    let prefix = EXAMPLE_LINK_PREFIX;
    let page = [
        "# Page".to_owned(),
        String::new(),
        format!("Shipped as [`a`]({prefix}a/compose.yaml):"),
        String::new(),
        "```yaml".to_owned(),
        "services: {}".to_owned(),
        "```".to_owned(),
        String::new(),
        "Not shipped:".to_owned(),
        String::new(),
        "```text".to_owned(),
        "anything".to_owned(),
        "```".to_owned(),
        String::new(),
        format!("Two at once: [x]({prefix}x/a) and [y]({prefix}y/b):"),
        String::new(),
        "```text".to_owned(),
        "ambiguous".to_owned(),
        "```".to_owned(),
        String::new(),
        format!("Unclosed [`b`]({prefix}b/Caddyfile):"),
        String::new(),
        "```text".to_owned(),
        "open".to_owned(),
    ]
    .join("\n");

    let (blocks, problems) = linked_blocks(&page, prefix);
    assert_eq!(
        blocks,
        vec![Block {
            link: format!("{prefix}a/compose.yaml"),
            body: "services: {}\n".to_owned(),
            line: 5,
        }],
        "want the one block of a/compose.yaml at line 5"
    );
    assert_eq!(
        problems,
        vec![
            "line 17: the block's paragraph links 2 example files, want one",
            "line 23: the block is never closed",
        ]
    );
}

/// A fenced code block of the page and the example file its paragraph links.
#[derive(Debug, PartialEq, Eq)]
struct Block {
    link: String,
    body: String,
    line: usize,
}

/// The fenced blocks whose preceding paragraph links an example file, a link target starting with
/// `prefix`, with what is wrong with the page: a paragraph that links more than one, or a block
/// left open.
fn linked_blocks(page: &str, prefix: &str) -> (Vec<Block>, Vec<String>) {
    let example_link = pattern(&format!(r"\]\(({}[^)#]+)\)", regex::escape(prefix)));
    let all = lines(page);
    let mut blocks = Vec::new();
    let mut problems = Vec::new();
    let mut paragraph: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < all.len() {
        let current = all[index];
        if !FENCE_LINE.is_match(current) {
            if current.trim().is_empty() {
                // A paragraph and its block, one blank line apart.
                let joins_block = !paragraph.is_empty()
                    && all
                        .get(index + 1)
                        .is_some_and(|next| FENCE_LINE.is_match(next));
                if !joins_block {
                    paragraph.clear();
                }
            } else {
                paragraph.push(current);
            }
            index += 1;
            continue;
        }

        let start = index;
        let joined = paragraph.join("\n");
        let links: Vec<String> = example_link
            .captures_iter(&joined)
            .filter_map(|found| found.get(1).map(|link| link.as_str().to_owned()))
            .collect();
        paragraph.clear();

        let Some(end) = all[start + 1..]
            .iter()
            .position(|next| FENCE_LINE.is_match(next))
        else {
            problems.push(format!("line {}: the block is never closed", start + 1));
            break;
        };
        index = start + 1 + end;
        let body = format!("{}\n", all[start + 1..index].join("\n"));
        match links.as_slice() {
            [] => {}
            [link] => blocks.push(Block {
                link: link.clone(),
                body,
                line: start + 1,
            }),
            _ => problems.push(format!(
                "line {}: the block's paragraph links {} example files, want one",
                start + 1,
                links.len()
            )),
        }
        index += 1;
    }
    (blocks, problems)
}

/// How a compose file's BitGauge service departs from the documented one.
fn hardening_problems(content: &str, timings: &[(&str, String)]) -> Vec<String> {
    let file: Option<Map<String, Value>> = match serde_saphyr::from_str(content) {
        Ok(file) => file,
        Err(error) => return vec![format!("does not parse: {error}")],
    };
    let file = file.map(Value::Object);
    let Some(bitgauge) = object(service_of_value(file.as_ref())) else {
        return vec![format!("has no {SERVICE} service")];
    };
    let bitgauge = Some(bitgauge);
    let key = |name: &str| bitgauge.and_then(|service| service.get(name));
    let absent = |name: &str| key(name).is_none_or(Value::is_null);

    let mut problems = Vec::new();
    let mut check = |held: bool, problem: String| {
        if !held {
            problems.push(problem);
        }
    };

    check(
        key("image").and_then(Value::as_str) == Some(IMAGE),
        format!("image is {}, want {IMAGE}", text(key("image"))),
    );
    check(
        key("read_only") == Some(&Value::Bool(true)),
        format!("read_only is {}, want true", text(key("read_only"))),
    );
    check(
        scalars(key("cap_drop")).is_some_and(|items| items == ["ALL"]),
        format!("cap_drop is {}, want [ALL]", text(key("cap_drop"))),
    );
    check(
        scalars(key("security_opt"))
            .is_some_and(|items| items.iter().any(|item| item == "no-new-privileges:true")),
        format!(
            "security_opt {} lacks no-new-privileges:true",
            text(key("security_opt"))
        ),
    );
    check(
        absent("volumes"),
        format!(
            "mounts volumes {}: BitGauge writes nothing and needs none",
            text(key("volumes"))
        ),
    );
    check(
        absent("tmpfs"),
        "mounts a tmpfs: BitGauge writes nothing and needs none".to_owned(),
    );
    for published in scalars(key("ports")).unwrap_or_default() {
        check(
            published.ends_with(&format!(":{PORT}")),
            format!("publishes {published}, want the container's port {PORT}"),
        );
    }
    let listens = object(key("environment"))
        .is_some_and(|environment| environment.contains_key("BITGAUGE_SERVER__LISTEN"));
    check(!listens, format!("moves server.listen off :{PORT}"));

    let healthcheck = key("healthcheck");
    let test = field(healthcheck, "test");
    check(
        scalars(test).is_some_and(|items| items == ["CMD", "/bitgauge", "healthcheck"]),
        format!(
            "healthcheck test is {}, want the exec form [CMD /bitgauge healthcheck]",
            text(test)
        ),
    );
    for (name, want) in timings {
        let got = text(field(healthcheck, name));
        check(
            &got == want,
            format!("healthcheck {name} is {got}, want {want}"),
        );
    }
    problems
}

/// The healthcheck timings of the image's HEALTHCHECK, keyed as a compose healthcheck names them.
fn image_timings() -> Vec<(&'static str, String)> {
    let dockerfile = repo::read(SHIPPED_DOCKERFILE);
    let found = HEALTHCHECK_RULE
        .captures(&dockerfile)
        .unwrap_or_else(|| panic!("{SHIPPED_DOCKERFILE} has no HEALTHCHECK with timings"));
    let group = |index: usize| {
        found
            .get(index)
            .map_or_else(String::new, |matched| matched.as_str().to_owned())
    };
    let retries: u64 = group(4)
        .parse()
        .unwrap_or_else(|error| panic!("retries {:?}: {error}", group(4)));
    vec![
        ("interval", group(1)),
        ("timeout", group(2)),
        ("start_period", group(3)),
        ("retries", retries.to_string()),
    ]
}

/// The fixed IPv4 address a proxy service takes on its one network, or empty.
fn proxy_address(proxy: &Value) -> String {
    object(field(Some(proxy), "networks"))
        .into_iter()
        .flatten()
        .find_map(|(_, network)| field(Some(network), "ipv4_address").and_then(Value::as_str))
        .unwrap_or_default()
        .to_owned()
}

fn parse_compose(relative: &str) -> Value {
    let path = format!("{EXAMPLES_DIR}/{relative}");
    let file: Option<Map<String, Value>> = serde_saphyr::from_str(&repo::read(&path))
        .unwrap_or_else(|error| panic!("{path}: {error}"));
    Value::Object(file.unwrap_or_default())
}

/// BitGauge's service in a parsed compose file.
fn service_of(file: &Value) -> Option<&Value> {
    service_of_value(Some(file))
}

fn service_of_value(file: Option<&Value>) -> Option<&Value> {
    field(field(file, "services"), SERVICE)
}

/// The value of `key` in a YAML mapping, or `None` for a missing key or anything but a mapping.
fn field<'value>(value: Option<&'value Value>, key: &str) -> Option<&'value Value> {
    object(value).and_then(|map| map.get(key))
}

/// A YAML mapping, or `None` for anything else.
fn object(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object)
}

/// A YAML sequence of scalars as text, or `None` for anything else.
fn scalars(value: Option<&Value>) -> Option<Vec<String>> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().map(|item| text(Some(item))).collect())
}

/// A value as Go's `fmt.Sprint` prints a scalar: a string bare, a missing value or null as
/// `<nil>`; anything else as its JSON.
fn text(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => "<nil>".to_owned(),
        Some(Value::String(string)) => string.clone(),
        Some(other) => other.to_string(),
    }
}

fn contains_trimmed_line(content: &str, want: &str) -> bool {
    lines(content).iter().any(|line| line.trim() == want.trim())
}

/// The lines of `content`, a final newline not starting another.
fn lines(content: &str) -> Vec<&str> {
    content
        .strip_suffix('\n')
        .unwrap_or(content)
        .split('\n')
        .collect()
}
