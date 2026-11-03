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

//! The compatibility step of a Compat profile over the docker CLI (testing.md section 5; Go's
//! `compat.go`): the clients run, their outputs are kept and read back by [`super::compat`].

use std::fs;
use std::io;
use std::time::Duration;

use super::bringup::Topology;
use super::compat::{Compat, CompatError, read_compat, write_goresponsiveness, write_librespeed};
use super::ping::artifacts_for;
use super::profiles::BROWSER_CHROMIUM;
use super::topology::CLIENT_OUT;

/// Bounds each compatibility client; each runs well under a minute.
const COMPAT_LIMIT: Duration = Duration::from_mins(3);
/// Where Caddy keeps the root of its internal CA, in the official image's data directory.
const CADDY_ROOT_CA: &str = "/data/caddy/pki/authorities/local/root.crt";
/// The bundle Go's crypto/x509 reads first on Alpine, which both clients use.
const TRUST_STORE: &str = "/etc/ssl/certs/ca-certificates.crt";

impl Topology {
    /// The compatibility step, after the browser run: librespeed-cli and goresponsiveness in the
    /// tools container that shares the client's namespace, on the browser's path through the
    /// proxy, then, in Chromium only, the `OpenSpeedTest` UI driven by `openspeedtest.spec.ts`.
    /// Each client's output goes into the run's compat directory and [`read_compat`] reads them
    /// back. Returns what was recorded, `None` when the directory could not be cleared, with
    /// every failure joined, one per line, as Go's `errors.Join`.
    pub fn compat(&self, browser: &str) -> (Option<Compat>, Result<(), String>) {
        let relative_dir = artifacts_for(&self.profile.name, browser).compat;
        let dir = self.cfg.out_dir.join(&relative_dir);

        // A re-run writes into the same directory: an earlier attempt's files must not stand in
        // for a client that failed this time.
        match fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return (None, Err(format!("clear {relative_dir}: {error}"))),
        }

        let server_json = format!("{}/.well-known/librespeed", self.url);
        let libre = self.exec_within(
            COMPAT_LIMIT,
            &self.shaper,
            &[
                "librespeed-cli",
                "--no-icmp",
                "--server-json",
                &server_json,
                "--server",
                "1",
                "--json",
            ],
        );
        let (out, run_error) = split(libre);
        let libre_error = write_librespeed(&dir, &out, run_error.as_deref()).err();

        let config = format!("{}/nq/config", self.url);
        let goresponsiveness = self.exec_within(
            COMPAT_LIMIT,
            &self.shaper,
            &["goresponsiveness", "--url", &config],
        );
        let (out, run_error) = split(goresponsiveness);
        let go_error = write_goresponsiveness(&dir, &out, run_error.as_deref()).err();

        let openspeedtest = browser == BROWSER_CHROMIUM;
        let mut open_error = None;
        if openspeedtest {
            open_error = self
                .playwright(
                    "harness/openspeedtest.spec.ts",
                    BROWSER_CHROMIUM,
                    &[
                        format!("HARNESS_OPENSPEEDTEST_URL={}", self.openspeedtest_url()),
                        format!("HARNESS_EXPORT_DIR={CLIENT_OUT}/{relative_dir}"),
                        format!(
                            "HARNESS_OUTPUT_DIR={CLIENT_OUT}/playwright/{}-openspeedtest",
                            self.profile.name
                        ),
                    ],
                )
                .err()
                .map(|error| format!("the OpenSpeedTest UI run: {error}"));
        }

        let (compat, read_errors) = read_compat(&dir, openspeedtest);
        let mut errors: Vec<String> = Vec::new();
        errors.extend(libre_error.as_ref().map(CompatError::to_string));
        errors.extend(go_error.as_ref().map(CompatError::to_string));
        errors.extend(open_error);
        if !read_errors.is_empty() {
            errors.push(CompatError::join(&read_errors));
        }
        if errors.is_empty() {
            (Some(compat), Ok(()))
        } else {
            (Some(compat), Err(errors.join("\n")))
        }
    }

    /// Installs Caddy's internal root into the shaper's trust store, where both compatibility
    /// clients read it, so they verify the proxy's certificate instead of skipping the check. The
    /// root travels in the environment of the one command that appends it.
    pub(super) fn trust_proxy_ca(&self) -> Result<(), String> {
        if !self.profile.compat {
            return Ok(());
        }
        let root = self
            .exec(&self.proxy, &["cat", CADDY_ROOT_CA])
            .map_err(|error| format!("read Caddy's root CA: {error}"))?;
        let variable = format!("CADDY_ROOT={root}");
        let script = format!(r#"printf '%s\n' "$CADDY_ROOT" >> {TRUST_STORE}"#);
        self.env
            .docker(&[
                "exec",
                "--env",
                &variable,
                &self.shaper,
                "sh",
                "-c",
                &script,
            ])
            .map(drop)
            .map_err(|error| format!("install Caddy's root CA in the shaper: {error}"))
    }
}

/// A client's output, or the message of its failed command, which carries its standard error;
/// the docker CLI returns no output then.
fn split(result: Result<String, String>) -> (String, Option<String>) {
    match result {
        Ok(out) => (out, None),
        Err(error) => (String::new(), Some(error)),
    }
}
