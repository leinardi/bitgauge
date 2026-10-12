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

package config

import (
	"io"
	"log/slog"
	"slices"
	"strings"

	"github.com/leinardi/bitgauge/internal/logger"
)

// ExitStatusInvalidConfig is the exit status of a process whose configuration failed
// validation: it stops before opening the listener (configuration.md section 4).
const ExitStatusInvalidConfig = 2

const (
	problemMessage = "invalid configuration"
	warningMessage = "suspicious configuration"
	attrKey        = "key"
	attrValue      = "value"
	attrRule       = "rule"
	logSection     = "log"
)

// ReportProblems logs every problem as one error line with key, value and rule attributes,
// through a logger built from the configured log settings on stdout. When those settings are
// themselves invalid, the lines are written as text to stderr instead (configuration-security.md
// section 2): that covers a log key with a problem of its own, whose decoded value is only the
// default it kept. The caller then exits with ExitStatusInvalidConfig.
func ReportProblems(problems []Problem, settings Log, stdout, stderr io.Writer) {
	log, err := logger.NewTo(stdout, settings.Format, settings.Level)
	if err != nil || slices.ContainsFunc(problems, isLogProblem) {
		log = StderrLogger(stderr)
	}

	for _, problem := range problems {
		log.Error(
			problemMessage,
			attrKey,
			problem.Key,
			attrValue,
			problem.Value,
			attrRule,
			problem.Rule,
		)
	}
}

func isLogProblem(problem Problem) bool {
	return problem.Key == logSection || strings.HasPrefix(problem.Key, logSection+keyDelimiter)
}

// ReportWarnings logs every warning at warn with key, value and rule attributes.
func ReportWarnings(log *slog.Logger, warnings []Problem) {
	for _, warning := range warnings {
		log.Warn(
			warningMessage,
			attrKey,
			warning.Key,
			attrValue,
			warning.Value,
			attrRule,
			warning.Rule,
		)
	}
}

// StderrLogger is the text logger on stderr used when the configuration cannot provide one.
func StderrLogger(stderr io.Writer) *slog.Logger {
	return slog.New(slog.NewTextHandler(stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
