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

//! Rebuilds the crate when the built SPA changes: `include_dir!` embeds `web/dist` but does
//! not tell cargo to watch it on a stable toolchain, and cargo scans a watched directory whole.

use std::io::{self, Write as _};

fn main() -> io::Result<()> {
    // Written rather than printed: the print macros are banned in the package.
    writeln!(io::stdout().lock(), "cargo::rerun-if-changed=web/dist")
}
