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

//! The ping and small probes.

use http::StatusCode;

use super::support::{body_bytes, header};
use crate::handlers::{ping, small};

/// Go: `TestPing`. HEAD is the router's (phase 12); hyper sends no body for it either way.
#[tokio::test]
async fn ping_is_204_without_a_body() {
    let response = ping();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(header(&response, "cache-control"), "no-store");
    assert!(body_bytes(response).await.is_empty());
}

/// Go: `TestSmall`
#[tokio::test]
async fn small_is_one_byte() {
    let response = small();
    assert_eq!(response.status(), StatusCode::OK);
    for (name, want) in [
        ("cache-control", "no-store"),
        ("content-length", "1"),
        ("content-type", "application/octet-stream"),
    ] {
        assert_eq!(header(&response, name), want, "{name}");
    }
    assert_eq!(body_bytes(response).await, "0");
}
