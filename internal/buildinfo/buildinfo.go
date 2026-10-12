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

// Package buildinfo holds the version, commit and build date stamped into the binary with
// -ldflags -X by the Makefile and the Dockerfile (backend.md section 1). GET /api/v1/info and
// the startup log line report them.
package buildinfo

const (
	// DefaultVersion is reported by a binary built without a stamped version, such as go run
	// or a plain go build.
	DefaultVersion = "dev"
	// Unknown is reported for a commit or build date that was not stamped.
	Unknown = "unknown"
)

// The stamped values. They stay empty unless the linker sets them, because -X can only set a
// string variable; Info substitutes the defaults so that callers never see an empty field.
var (
	version string
	commit  string
	date    string
)

// Build is the build information of the running binary.
type Build struct {
	// Version is the release version, or DefaultVersion when unstamped.
	Version string
	// Commit is the source commit, or Unknown when unstamped.
	Commit string
	// Date is the build date as RFC 3339 UTC text, or Unknown when unstamped.
	Date string
}

// Info returns the build information of the running binary, with DefaultVersion and Unknown in
// place of anything the build did not stamp.
func Info() Build {
	return resolve(version, commit, date)
}

func resolve(stampedVersion, stampedCommit, stampedDate string) Build {
	return Build{
		Version: orDefault(stampedVersion, DefaultVersion),
		Commit:  orDefault(stampedCommit, Unknown),
		Date:    orDefault(stampedDate, Unknown),
	}
}

func orDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}
