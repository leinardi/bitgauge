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

//! The Go configuration tests (`internal/config`), ported. Each test names the Go test it maps
//! to in a `/// Go:` line; a Go file written to a temporary directory becomes the file's text
//! handed to the loader, since the server's code may not write files.

use std::path::PathBuf;

use super::load::from_text;
use super::{Loaded, Problem, check};

mod effective;
mod load;
mod types;
mod validate;

/// The environment as name and value pairs, from `NAME=value` entries.
fn environment(entries: &[&str]) -> Vec<(String, String)> {
    entries
        .iter()
        .map(|entry| {
            let (name, value) = entry.split_once('=').expect("NAME=value");
            (name.to_owned(), value.to_owned())
        })
        .collect()
}

/// Loads a file's text and an environment; the text must parse.
fn load(file: &str, entries: &[&str]) -> Loaded {
    from_text(file, &environment(entries)).expect("the file parses")
}

/// Every problem `check` reports for a file and an environment.
fn problems_for(file: &str, entries: &[&str]) -> Vec<Problem> {
    check(&load(file, entries))
}

fn problem_keys(problems: &[Problem]) -> Vec<&str> {
    problems
        .iter()
        .map(|problem| problem.key.as_str())
        .collect()
}

/// A path that does not exist.
fn missing_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "bitgauge-config-test-{}-absent.yaml",
        std::process::id()
    ))
}
