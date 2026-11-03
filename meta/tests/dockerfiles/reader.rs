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

//! Reads Dockerfiles closely enough to assert the image invariants of build-packaging.md
//! section 1: stages, their bases and the instructions inside them. A file this reader cannot
//! take apart is refused rather than guessed at.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

/// One Dockerfile instruction with its continuation lines joined.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instruction {
    /// The instruction, upper-cased: FROM, RUN, COPY, ...
    pub keyword: String,
    /// Everything after the keyword, with continuations joined and whitespace runs collapsed.
    pub args: String,
}

/// One FROM and the instructions up to the next.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Stage {
    /// The AS alias, empty for an unnamed stage.
    pub name: String,
    /// The `--platform` value, empty when the stage has none.
    pub platform: String,
    /// The base reference exactly as written.
    pub image: String,
    /// The stage's instructions, without the FROM itself.
    pub instructions: Vec<Instruction>,
}

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// A literal registry reference with a tag and a sha256 digest. A variable anywhere in the
/// reference makes it unpinnable by a reader: the value lives in a build argument.
static DIGEST_PINNED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[a-z0-9.\-/:]+:[A-Za-z0-9._\-]+@sha256:[0-9a-f]{64}$"));

/// A literal registry reference with a tag and no digest.
static TAG_PINNED: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[a-z0-9.\-/:]+:[A-Za-z0-9._\-]+$"));

/// One `# key=value` line of the block `BuildKit` reads before anything else.
static PARSER_DIRECTIVE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^#\s*([A-Za-z]+)\s*=\s*(\S+)\s*$"));

/// One `key=value` pair of a LABEL, the value quoted or bare.
static LABEL_PAIR: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"([A-Za-z0-9._\-]+)=("(?:[^"\\]|\\.)*"|\S+)"#));

/// The registry whose bases are pinned by tag, not by digest: it republishes its tags to ship
/// security fixes (build-packaging.md section 1).
const DHI_REGISTRY: &str = "dhi.io/";

/// The value of the file's syntax parser directive. `BuildKit` reads directives only from the
/// file's leading lines and stops at the first line that is not one (a comment, a blank line or
/// an instruction), so a `# syntax=` line anywhere later is an ordinary comment: this reader
/// stops at the same place, and reports the directive missing rather than find one `BuildKit`
/// ignores.
pub fn syntax(content: &str) -> Option<String> {
    for line in content.split('\n') {
        let directive = PARSER_DIRECTIVE.captures(line.trim())?;
        let key = directive.get(1).map_or("", |found| found.as_str());
        if key.eq_ignore_ascii_case("syntax") {
            return directive.get(2).map(|found| found.as_str().to_owned());
        }
    }
    None
}

/// Splits a Dockerfile into instructions, dropping comments and blank lines and joining
/// backslash continuations, and groups them into stages.
///
/// # Errors
///
/// An instruction other than ARG before the first FROM, a FROM this reader cannot take apart, or
/// a file that ends inside a continuation.
pub fn parse(content: &str) -> Result<Vec<Stage>, String> {
    let mut stages: Vec<Stage> = Vec::new();
    let mut pending = String::new();
    for line in content.split('\n') {
        let trimmed = line.trim();
        // A comment line is dropped even inside a continuation, as BuildKit does.
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(body) = trimmed.strip_suffix('\\') {
            pending.push_str(body);
            pending.push(' ');
            continue;
        }
        pending.push_str(trimmed);
        let instruction = pending.split_whitespace().collect::<Vec<_>>().join(" ");
        pending.clear();
        let (keyword, args) = instruction
            .split_once(' ')
            .unwrap_or((instruction.as_str(), ""));
        let keyword = keyword.to_uppercase();
        if keyword == "FROM" {
            stages.push(parse_from(args)?);
            continue;
        }
        let Some(last) = stages.last_mut() else {
            if keyword == "ARG" {
                continue;
            }
            return Err(format!(
                "malformed Dockerfile: {keyword} before the first FROM"
            ));
        };
        last.instructions.push(Instruction {
            keyword,
            args: args.to_owned(),
        });
    }
    if !pending.trim().is_empty() {
        return Err("malformed Dockerfile: the file ends inside a continuation".to_owned());
    }
    Ok(stages)
}

fn parse_from(args: &str) -> Result<Stage, String> {
    let mut stage = Stage::default();
    let mut fields: Vec<&str> = args.split_whitespace().collect();
    while let Some(flag) = fields.first().filter(|field| field.starts_with("--")) {
        if let Some(platform) = flag.strip_prefix("--platform=") {
            platform.clone_into(&mut stage.platform);
        }
        fields.remove(0);
    }
    match fields.as_slice() {
        [image] => (*image).clone_into(&mut stage.image),
        [image, alias, name] if alias.eq_ignore_ascii_case("AS") => {
            (*image).clone_into(&mut stage.image);
            (*name).clone_into(&mut stage.name);
        }
        _ => return Err(format!("malformed Dockerfile: FROM {args}")),
    }
    Ok(stage)
}

/// Whether a base reference is literal and pinned by digest.
pub fn digest_pinned(image: &str) -> bool {
    DIGEST_PINNED.is_match(image)
}

/// Whether a base reference is literal and pinned by an explicit tag alone: a tag other than
/// latest, and no digest.
pub fn tag_pinned(image: &str) -> bool {
    TAG_PINNED.is_match(image) && !tag(image).eq_ignore_ascii_case("latest")
}

/// Whether a base reference comes from dhi.io.
pub fn from_dhi(image: &str) -> bool {
    image.starts_with(DHI_REGISTRY)
}

/// Whether a base reference is pinned the way its registry requires: a dhi.io base by an
/// explicit tag and no digest, so a build takes the fixes dhi.io republishes under it; any other
/// base by tag and digest.
pub fn base_pinned(image: &str) -> bool {
    if from_dhi(image) {
        tag_pinned(image)
    } else {
        digest_pinned(image)
    }
}

/// The reference without its digest, split at the tag's colon when it has one. A colon before the
/// last slash is a registry port, not a tag.
fn split_tag(image: &str) -> (&str, Option<&str>) {
    let name = image.split_once('@').map_or(image, |(name, _)| name);
    let slash = name.rfind('/');
    match name.rfind(':') {
        Some(colon) if slash.is_none_or(|slash| colon > slash) => {
            (&name[..colon], Some(&name[colon + 1..]))
        }
        Some(_) | None => (name, None),
    }
}

/// The reference without its tag and digest: `dhi.io/node` for `dhi.io/node:24-alpine3.23-dev`,
/// `docker/dockerfile` for `docker/dockerfile:1.7@sha256:...`.
pub fn repository(image: &str) -> &str {
    split_tag(image).0
}

/// The tag of a reference, empty when it has none.
pub fn tag(image: &str) -> &str {
    split_tag(image).1.unwrap_or("")
}

/// The LABEL key/value pairs of a stage, with the quotes around values removed.
pub fn labels(stage: &Stage) -> BTreeMap<String, String> {
    let mut labels = BTreeMap::new();
    for instruction in &stage.instructions {
        if instruction.keyword != "LABEL" {
            continue;
        }
        for pair in LABEL_PAIR.captures_iter(&instruction.args) {
            let key = pair.get(1).map_or("", |found| found.as_str());
            let value = pair.get(2).map_or("", |found| found.as_str());
            labels.insert(key.to_owned(), value.trim_matches('"').to_owned());
        }
    }
    labels
}
