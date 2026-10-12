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

// Package logger is the small log/slog wrapper of decisions.md section 6: a text or JSON handler
// at the configured level (configuration.md section 2.5), writing to stdout. What may and may
// never be logged is configuration-security.md section 6; this package only builds the logger.
package logger

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
)

// The values of log.format.
const (
	FormatText = "text"
	FormatJSON = "json"
)

// The values of log.level.
const (
	LevelDebug = "debug"
	LevelInfo  = "info"
	LevelWarn  = "warn"
	LevelError = "error"
)

var (
	// ErrUnknownFormat is returned for a log.format other than text or json.
	ErrUnknownFormat = errors.New("unknown log format")
	// ErrUnknownLevel is returned for a log.level other than debug, info, warn or error.
	ErrUnknownLevel = errors.New("unknown log level")
)

// New returns a logger writing to stdout with the handler named by format and the minimum level
// named by level. An unknown format or level is an error, never a silent default: configuration
// is validated fail-closed (configuration-security.md section 2).
func New(format, level string) (*slog.Logger, error) {
	return NewTo(os.Stdout, format, level)
}

// NewTo is New writing to out instead of stdout.
func NewTo(out io.Writer, format, level string) (*slog.Logger, error) {
	minLevel, err := ParseLevel(level)
	if err != nil {
		return nil, err
	}

	options := &slog.HandlerOptions{Level: minLevel}

	switch format {
	case FormatText:
		return slog.New(slog.NewTextHandler(out, options)), nil
	case FormatJSON:
		return slog.New(slog.NewJSONHandler(out, options)), nil
	default:
		return nil, fmt.Errorf(
			"%w: %q (want %q or %q)",
			ErrUnknownFormat,
			format,
			FormatText,
			FormatJSON,
		)
	}
}

// ParseLevel maps a log.level value to its slog level. Only the four documented lower-case
// values are accepted.
func ParseLevel(level string) (slog.Level, error) {
	switch level {
	case LevelDebug:
		return slog.LevelDebug, nil
	case LevelInfo:
		return slog.LevelInfo, nil
	case LevelWarn:
		return slog.LevelWarn, nil
	case LevelError:
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf(
			"%w: %q (want %q, %q, %q or %q)",
			ErrUnknownLevel, level, LevelDebug, LevelInfo, LevelWarn, LevelError,
		)
	}
}
