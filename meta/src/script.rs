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

//! Running a repository script under test: the dist checks drive `scripts/*.sh` on scratch trees
//! and read what the script says and how it exits.

use std::fs;
use std::io::Read as _;
use std::path::Path;
use std::process::{Command, ExitStatus};
use std::thread;
use std::time::{Duration, Instant};

use crate::repo;

/// How long one run of a script may take before it is killed and the test fails.
pub const COMMAND_TIMEOUT: Duration = Duration::from_mins(1);

/// How often a running script is polled for its exit.
const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// Writes `files` (relative path to content) under `dir`, creating the directories between.
///
/// # Panics
///
/// When a directory or a file cannot be written.
pub fn write_files(dir: &Path, files: &[(&str, &[u8])]) {
    for (relative, content) in files {
        let path = dir.join(relative);
        let parent = path.parent().unwrap_or(dir);
        fs::create_dir_all(parent)
            .unwrap_or_else(|error| panic!("create {}: {error}", parent.display()));
        fs::write(&path, content).unwrap_or_else(|error| panic!("write {relative}: {error}"));
    }
}

/// Runs the repository script `script` (relative to the root), with the arguments, working
/// directory and environment `configure` sets, and returns its stdout and stderr as they
/// interleave on one pipe, with its exit status.
///
/// # Panics
///
/// When the script is missing, cannot be run or read, or runs past [`COMMAND_TIMEOUT`] (it is
/// killed first).
pub fn run(script: &str, configure: impl FnOnce(&mut Command)) -> (String, ExitStatus) {
    let path = repo::path(script);
    fs::read(&path).unwrap_or_else(|error| panic!("read {script}: {error}"));
    let (mut reader, writer) =
        std::io::pipe().unwrap_or_else(|error| panic!("create a pipe: {error}"));
    let stderr = writer
        .try_clone()
        .unwrap_or_else(|error| panic!("clone the pipe: {error}"));
    // The command holds the pipe's writing ends; it is dropped at the end of this block, so the
    // reader sees end of file once the script and its children exit.
    let mut child = {
        let mut command = Command::new(&path);
        configure(&mut command);
        command.stdout(writer).stderr(stderr);
        command
            .spawn()
            .unwrap_or_else(|error| panic!("run {script}: {error}"))
    };
    let collector = thread::spawn(move || {
        let mut output = Vec::new();
        reader
            .read_to_end(&mut output)
            .unwrap_or_else(|error| panic!("read the output: {error}"));
        output
    });
    let deadline = Instant::now() + COMMAND_TIMEOUT;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .unwrap_or_else(|error| panic!("wait for {script}: {error}"))
        {
            break status;
        }
        if Instant::now() >= deadline {
            child
                .kill()
                .unwrap_or_else(|error| panic!("kill {script}: {error}"));
            panic!("{script} ran longer than {COMMAND_TIMEOUT:?}");
        }
        thread::sleep(POLL_INTERVAL);
    };
    let output = collector
        .join()
        .unwrap_or_else(|error| panic!("collect the output of {script}: {error:?}"));
    (String::from_utf8_lossy(&output).into_owned(), status)
}
