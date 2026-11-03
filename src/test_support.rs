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

//! What the unit tests share. Compiled under `#[cfg(test)]` only (`meta/tests/lint_exemptions.rs`).

use std::net::SocketAddr;

use tokio::net::TcpStream;

/// Connects to a test server on the loopback interface: the one connect the unit tests make.
///
/// # Panics
///
/// The connection is refused, naming the address.
#[expect(
    clippy::disallowed_methods,
    reason = "unit tests dial their own loopback server; the shipped code never connects"
)]
pub(crate) async fn dial_loopback(address: SocketAddr) -> TcpStream {
    assert!(
        address.ip().is_loopback(),
        "{address} is not a loopback address"
    );
    TcpStream::connect(address)
        .await
        .unwrap_or_else(|error| panic!("connect to {address}: {error}"))
}

/// A log writer that keeps what a test logged, for the logger and the configuration reports.
#[derive(Debug, Clone, Default)]
pub(crate) struct Capture(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

impl Capture {
    /// Everything written so far.
    pub(crate) fn text(&self) -> String {
        String::from_utf8(self.0.lock().expect("capture lock").clone()).expect("UTF-8 log lines")
    }

    /// The written lines, as JSON objects.
    pub(crate) fn json_lines(&self) -> Vec<serde_json::Value> {
        self.text()
            .lines()
            .map(|line| serde_json::from_str(line).expect("a JSON log line"))
            .collect()
    }
}

impl std::io::Write for Capture {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0
            .lock()
            .expect("capture lock")
            .extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl tracing_subscriber::fmt::MakeWriter<'_> for Capture {
    type Writer = Self;

    fn make_writer(&self) -> Self {
        self.clone()
    }
}
