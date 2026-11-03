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

//! The version, commit and build date stamped into the binary at compile time from
//! `BITGAUGE_VERSION`, `BITGAUGE_COMMIT` and `BITGAUGE_DATE`, which the builds set to the values
//! the Go build stamped with `-ldflags -X` (backend.md section 1). `GET /api/v1/info` and the
//! startup log line report them.

/// The version of a binary built without a stamped version, such as a plain `cargo build`.
pub const DEFAULT_VERSION: &str = "dev";

/// The commit or build date of a binary that was not stamped with it.
pub const UNKNOWN: &str = "unknown";

/// The build information of the running binary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Build {
    /// The release version, or [`DEFAULT_VERSION`] when unstamped.
    pub version: &'static str,
    /// The source commit, or [`UNKNOWN`] when unstamped.
    pub commit: &'static str,
    /// The build date as RFC 3339 UTC text, or [`UNKNOWN`] when unstamped.
    pub date: &'static str,
}

/// The build information of the running binary, with [`DEFAULT_VERSION`] and [`UNKNOWN`] in place
/// of anything the build did not stamp.
#[must_use]
pub fn info() -> Build {
    resolve(
        option_env!("BITGAUGE_VERSION"),
        option_env!("BITGAUGE_COMMIT"),
        option_env!("BITGAUGE_DATE"),
    )
}

/// The stamps with their defaults; an empty stamp counts as unstamped, as the Go build's empty
/// `-X` value did.
fn resolve(
    version: Option<&'static str>,
    commit: Option<&'static str>,
    date: Option<&'static str>,
) -> Build {
    let or = |stamp: Option<&'static str>, fallback| {
        stamp.filter(|stamp| !stamp.is_empty()).unwrap_or(fallback)
    };
    Build {
        version: or(version, DEFAULT_VERSION),
        commit: or(commit, UNKNOWN),
        date: or(date, UNKNOWN),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Go: `TestInfoDefaultsWhenUnstamped`. The tests are built without the stamps
    /// (`.mk/rust.mk` stamps only the builds).
    #[test]
    fn info_defaults_when_unstamped() {
        assert_eq!(
            info(),
            Build {
                version: DEFAULT_VERSION,
                commit: UNKNOWN,
                date: UNKNOWN
            }
        );
    }

    /// Go: `TestResolve`
    #[test]
    fn resolve_fills_the_defaults() {
        let build = |version, commit, date| Build {
            version,
            commit,
            date,
        };
        for (name, (version, commit, date), want) in [
            (
                "nothing stamped",
                (None, None, None),
                build("dev", "unknown", "unknown"),
            ),
            (
                "empty stamps",
                (Some(""), Some(""), Some("")),
                build("dev", "unknown", "unknown"),
            ),
            (
                "everything stamped",
                (
                    Some("v0.1.0"),
                    Some("a1b2c3d4e5f6"),
                    Some("2026-10-12T08:00:00Z"),
                ),
                build("v0.1.0", "a1b2c3d4e5f6", "2026-10-12T08:00:00Z"),
            ),
            (
                "only the version stamped",
                (Some("v0.1.0-3-gabcdef0-dirty"), None, None),
                build("v0.1.0-3-gabcdef0-dirty", "unknown", "unknown"),
            ),
            (
                "commit and date stamped, version empty",
                (Some(""), Some("abc"), Some("2026-10-12T08:00:00Z")),
                build("dev", "abc", "2026-10-12T08:00:00Z"),
            ),
        ] {
            assert_eq!(resolve(version, commit, date), want, "{name}");
        }
    }
}
