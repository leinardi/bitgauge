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

//! The offline link check of the Markdown documentation, ported from `test/docs/links.go`: every
//! relative link and fragment must resolve, fragments under GitHub's heading slug rules. It needs
//! no network, so it can run on every Markdown change.
//!
//! The patterns are the Go ones with RE2's ASCII classes spelled out: Rust's `\s`, `\S` and `\b`
//! are Unicode-aware, Go's are not, so `[\t\n\f\r ]` and `(?-u:\b)` stand in for them.

use std::collections::{HashMap, HashSet};
use std::fmt::{self, Write as _};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

static INLINE_LINK: LazyLock<Regex> = LazyLock::new(|| {
    pattern(concat!(
        r"!?\[[^\]]*\]\([\t\n\f\r ]*(<[^>]*>|[^)\t\n\f\r ]+)",
        r#"(?:[\t\n\f\r ]+"[^"]*")?[\t\n\f\r ]*\)"#,
    ))
});
static REFERENCE_DEF: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[\t\n\f\r ]{0,3}\[[^\]]+\]:[\t\n\f\r ]*(<[^>]*>|[^\t\n\f\r ]+)"));
static ATX_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^[\t\n\f\r ]{0,3}(#{1,6})[\t\n\f\r ]+(.*?)[\t\n\f\r ]*#*[\t\n\f\r ]*$")
});
static HTML_ANCHOR: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"<a[\t\n\f\r ]+(?:id|name)="([^"]+)""#));
static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| pattern("`+[^`]*`+"));
static LINK_IN_HEADING: LazyLock<Regex> = LazyLock::new(|| pattern(r"!?\[([^\]]*)\]\([^)]*\)"));
static HTML_TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"<[^>]+>"));
static EDGE_UNDERLINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(^|[^\p{L}\p{N}])_+|_+([^\p{L}\p{N}]|$)"));
static URI_SCHEME: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[a-zA-Z][a-zA-Z0-9+.-]*:"));
/// What a slug drops: everything but letters, marks, numbers, connector punctuation, spaces and
/// hyphens (Go's `unicode.IsLetter`, `IsMark`, `IsNumber` and `Pc`, by general category).
static SLUG_DROPPED: LazyLock<Regex> = LazyLock::new(|| pattern(r"[^\p{L}\p{M}\p{N}\p{Pc} -]"));

/// One broken link, reported against the file and line that contains it.
#[derive(Debug)]
pub struct Problem {
    pub file: String,
    pub line: usize,
    pub message: String,
}

impl fmt::Display for Problem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}:{}: {}", self.file, self.line, self.message)
    }
}

/// The lines of a Markdown text that are prose, with fenced code blocks blanked out so line
/// numbers still match the file. Split on `\n` alone, as Go does, so a `\r` stays on its line.
pub fn lines(content: &str) -> Vec<String> {
    let mut lines: Vec<String> = content.split('\n').map(str::to_owned).collect();
    let mut fence = "";
    for line in &mut lines {
        let trimmed = line.trim();
        if !fence.is_empty() {
            if trimmed.starts_with(fence) {
                fence = "";
            }
            line.clear();
            continue;
        }
        if let Some(marker) = ["```", "~~~"]
            .into_iter()
            .find(|marker| trimmed.starts_with(marker))
        {
            fence = marker;
            line.clear();
        }
    }
    lines
}

/// The fragments a Markdown text defines: its headings under GitHub's slug rules, numbered on
/// repetition, and any explicit HTML anchors.
pub fn anchors(content: &str) -> HashSet<String> {
    let mut anchors = HashSet::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    for line in lines(content) {
        for found in HTML_ANCHOR.captures_iter(&line) {
            anchors.insert(found[1].to_owned());
        }
        let Some(heading) = ATX_HEADING.captures(&line) else {
            continue;
        };
        let slug = slug(&heading[2]);
        let count = seen.entry(slug.clone()).or_default();
        if *count > 0 {
            anchors.insert(format!("{slug}-{count}"));
        } else {
            anchors.insert(slug);
        }
        *count += 1;
    }
    anchors
}

/// The anchor GitHub generates for a heading: the rendered text, lower-cased, with everything but
/// letters, marks, numbers, connector punctuation, spaces and hyphens removed, and each space
/// turned into a hyphen.
pub fn slug(heading: &str) -> String {
    // Go lower-cases rune by rune with the simple mapping: no final sigma, and U+0130 becomes a
    // plain `i`, the one character whose full lowercase mapping has two.
    let lower: String = render_text(heading)
        .chars()
        .flat_map(|character| {
            let mapped: Vec<char> = if character == '\u{130}' {
                vec!['i']
            } else {
                character.to_lowercase().collect()
            };
            mapped
        })
        .collect();
    SLUG_DROPPED.replace_all(&lower, "").replace(' ', "-")
}

/// The heading text as rendered: link targets, HTML tags, emphasis markers and code-span
/// backticks stripped, the code itself kept.
fn render_text(heading: &str) -> String {
    let mut rendered = String::new();
    let mut last = 0;
    for span in CODE_SPAN.find_iter(heading) {
        rendered.push_str(&strip_inline(&heading[last..span.start()]));
        rendered.push_str(span.as_str().trim_matches('`'));
        last = span.end();
    }
    rendered.push_str(&strip_inline(&heading[last..]));
    rendered
}

fn strip_inline(text: &str) -> String {
    let text = LINK_IN_HEADING.replace_all(text, "$1");
    let text = HTML_TAG.replace_all(&text, "");
    let text = text.replace('*', "");
    EDGE_UNDERLINE.replace_all(&text, "$1$2").into_owned()
}

/// The link targets on one prose line, inline code spans excluded.
pub fn targets(line: &str) -> Vec<String> {
    let line = CODE_SPAN.replace_all(line, "");
    let mut targets: Vec<String> = INLINE_LINK
        .captures_iter(&line)
        .map(|found| found[1].trim_matches(['<', '>']).to_owned())
        .collect();
    if let Some(found) = REFERENCE_DEF.captures(&line) {
        targets.push(found[1].trim_matches(['<', '>']).to_owned());
    }
    targets
}

/// Resolves links against a repository root, caching each target file's anchors.
pub struct Checker {
    root: PathBuf,
    anchors: HashMap<String, HashSet<String>>,
}

impl Checker {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            anchors: HashMap::new(),
        }
    }

    /// Checks every relative link in the Markdown file at `rel`, a slash-separated path relative
    /// to the root.
    pub fn check_file(&mut self, rel: &str) -> Vec<Problem> {
        let content = fs::read_to_string(self.root.join(rel))
            .unwrap_or_else(|error| panic!("read {rel}: {error}"));
        self.check_text(rel, &content)
    }

    /// Checks `content` as if it were the file at `rel`. Paths are resolved logically, against
    /// `rel`'s own directory, and then followed through any symlink on disk.
    pub fn check_text(&mut self, rel: &str, content: &str) -> Vec<Problem> {
        let mut problems = Vec::new();
        for (index, line) in lines(content).iter().enumerate() {
            for target in targets(line) {
                if let Some(message) = self.check_target(rel, &target) {
                    problems.push(Problem {
                        file: rel.to_owned(),
                        line: index + 1,
                        message,
                    });
                }
            }
        }
        problems
    }

    fn check_target(&mut self, rel: &str, target: &str) -> Option<String> {
        if URI_SCHEME.is_match(target) || target.starts_with("//") {
            return None;
        }
        let (file, fragment) = target.split_once('#').unwrap_or((target, ""));
        let quoted = go_quote(target);
        let mut resolved = rel.to_owned();
        if !file.is_empty() {
            resolved = match file.strip_prefix('/') {
                Some(absolute) => clean(absolute),
                None => clean(&format!("{}/{file}", dir(rel))),
            };
            if resolved.starts_with("../") || resolved == ".." {
                return Some(format!("link {quoted} leaves the repository"));
            }
            if fs::metadata(self.root.join(&resolved)).is_err() {
                return Some(format!("link {quoted}: {resolved} does not exist"));
            }
        }
        if fragment.is_empty() || !is_markdown(&resolved) {
            return None;
        }
        match self.anchors_of(&resolved) {
            Err(error) => Some(format!("link {quoted}: {error}")),
            Ok(anchors) if !anchors.contains(fragment) => Some(format!(
                "link {quoted}: {resolved} has no heading or anchor #{fragment}"
            )),
            Ok(_) => None,
        }
    }

    fn anchors_of(&mut self, rel: &str) -> Result<&HashSet<String>, String> {
        if !self.anchors.contains_key(rel) {
            let content = fs::read_to_string(self.root.join(rel))
                .map_err(|error| format!("read {rel}: {error}"))?;
            self.anchors.insert(rel.to_owned(), anchors(&content));
        }
        self.anchors
            .get(rel)
            .ok_or_else(|| format!("read {rel}: not cached"))
    }
}

/// Go's `path.Clean`: the shortest equivalent slash path, `.` for an empty one.
fn clean(path: &str) -> String {
    let rooted = path.starts_with('/');
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." if segments.last().is_some_and(|last| *last != "..") => {
                segments.pop();
            }
            ".." if rooted => {}
            _ => segments.push(segment),
        }
    }
    let joined = segments.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".to_owned(),
        (false, false) => joined,
    }
}

/// Go's `path.Dir`: everything before the last slash, cleaned.
fn dir(path: &str) -> String {
    clean(path.rfind('/').map_or("", |slash| &path[..slash]))
}

/// Go's `%q` for the characters a link target can hold: printable characters as they are,
/// quotes and backslashes escaped, control and space characters as escapes.
fn go_quote(text: &str) -> String {
    let mut quoted = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\u{7}' => quoted.push_str("\\a"),
            '\u{8}' => quoted.push_str("\\b"),
            '\u{c}' => quoted.push_str("\\f"),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            '\u{b}' => quoted.push_str("\\v"),
            ' ' => quoted.push(' '),
            _ if character < ' ' || character == '\u{7f}' => {
                push_escape(&mut quoted, "x", 2, character);
            }
            _ if character.is_control() || character.is_whitespace() => {
                push_escape(&mut quoted, "u", 4, character);
            }
            _ => quoted.push(character),
        }
    }
    quoted.push('"');
    quoted
}

/// Appends `\<kind>` and the code point in at least `width` hex digits, as Go's `%q` does.
fn push_escape(quoted: &mut String, kind: &str, width: usize, character: char) {
    write!(quoted, "\\{kind}{:0width$x}", u32::from(character))
        .unwrap_or_else(|error| panic!("format an escape: {error}"));
}

/// Whether a slash path names a Markdown file: Go's case-sensitive `.md` suffix.
pub fn is_markdown(path: &str) -> bool {
    Path::new(path)
        .extension()
        .is_some_and(|extension| extension == "md")
}
