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

//! The compatibility layers (compatibility.md): OpenSpeedTest, LibreSpeed and Apple
//! networkQuality, each translated onto the native building blocks of [`crate::handlers`] and
//! mounted only when its toggle is set.
//!
//! Each layer's router serves exactly the paths and methods of its route-table rows
//! (compatibility.md section 5). A path is routed with `any` and dispatched on the method by the
//! layer itself, so that a method its row does not list, `HEAD` included, gets the envelope 405
//! with the row's Allow value, as Go's routers answered, rather than axum's implicit `HEAD` and
//! plain 405.

use http::Method;

pub mod librespeed;
pub mod nq;
pub mod openspeedtest;

#[cfg(test)]
mod tests;

/// One route-table row of a layer: a path and the methods it serves, in the order its Allow
/// value names them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    /// The exact path, relative to `server.base_path`.
    pub path: &'static str,
    /// The methods served, in Allow order.
    pub methods: &'static [Method],
    /// The Allow value of the row's 405.
    pub allow: &'static str,
}
