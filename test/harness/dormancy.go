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

package harness

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// The files the harness needs before there is anything to measure: the binary and the runnable,
// embedded SPA the image is built from (the plan's dormant-gate registry, image prerequisites).
var prerequisiteFiles = []string{
	"cmd/bitgauge/main.go",
	"web/embed.go",
	"web/index.html",
	"web/src/main.ts",
}

// The docs/STATUS.md rows that must have left "Spec'd": the image prerequisites, then the
// engine's result object and the Test screen the harness drives.
var prerequisiteRows = []string{
	"Single binary, embedded SPA",
	"Native API:",
	"Engine: headline, peak, confidence and notices, result object",
	"UI: Test screen",
}

// extractionPath is the result-extraction path (open question 9): the Test screen's single-result
// Download JSON, which the driver clicks. It must stay specified in docs/features/ui/screens.md.
const extractionPath = "**Download JSON** of the finished result"

var errStatusRow = errors.New("docs/STATUS.md lacks a harness prerequisite row")

// Unmet lists the harness prerequisites the tree under root does not meet yet; while any is unmet
// the harness is dormant and its runners refuse to start. An error means the list could not be
// established, which is not the same as dormant.
func Unmet(root string) ([]string, error) {
	var unmet []string

	for _, file := range prerequisiteFiles {
		_, err := os.Stat(filepath.Join(root, filepath.FromSlash(file)))
		if errors.Is(err, os.ErrNotExist) {
			unmet = append(unmet, file+" does not exist")

			continue
		}

		if err != nil {
			return nil, fmt.Errorf("stat %s: %w", file, err)
		}
	}

	status, err := os.ReadFile(filepath.Join(root, "docs", "STATUS.md"))
	if err != nil {
		return nil, fmt.Errorf("read docs/STATUS.md: %w", err)
	}

	for _, row := range prerequisiteRows {
		state, found := statusOf(string(status), row)
		if !found {
			return nil, fmt.Errorf("%w: %q", errStatusRow, row)
		}

		if strings.HasPrefix(state, "Spec'd") {
			unmet = append(unmet, "STATUS row \""+row+"…\" is "+state)
		}
	}

	screens, err := os.ReadFile(filepath.Join(root, "docs", "features", "ui", "screens.md"))
	if err != nil {
		return nil, fmt.Errorf("read docs/features/ui/screens.md: %w", err)
	}

	if !strings.Contains(string(screens), extractionPath) {
		unmet = append(
			unmet,
			"docs/features/ui/screens.md no longer specifies the Download JSON extraction path",
		)
	}

	return unmet, nil
}

// statusOf returns the Status cell of the STATUS.md row whose feature cell starts with prefix.
func statusOf(status, prefix string) (string, bool) {
	for line := range strings.SplitSeq(status, "\n") {
		cells := strings.Split(line, "|")
		if len(cells) < 3 || !strings.HasPrefix(strings.TrimSpace(cells[1]), prefix) {
			continue
		}

		return strings.TrimSpace(cells[2]), true
	}

	return "", false
}
