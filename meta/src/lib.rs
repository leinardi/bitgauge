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

//! Repository meta-tests: checks on the repository itself rather than on the server. The tests
//! live under `tests/` and run rust-common's `repo-meta` checks on this repository, each with its
//! parameters, beside the checks that are BitGauge's own; this library holds what they share.

pub mod cargo;

use std::path::Path;

use repo_meta::Repo;

/// The shipped Dockerfile, the one release image.
pub const SHIPPED_DOCKERFILE: &str = "deployments/docker/Dockerfile";

/// This repository: the meta crate sits one level below its root. The root is fixed at compile
/// time, so a test binary checks the checkout it was built from.
#[must_use]
pub fn repo() -> Repo {
    Repo::new(Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
}
