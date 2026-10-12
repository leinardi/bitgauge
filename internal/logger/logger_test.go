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

package logger

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
)

func TestParseLevel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input   string
		want    slog.Level
		wantErr error
	}{
		{input: "debug", want: slog.LevelDebug},
		{input: "info", want: slog.LevelInfo},
		{input: "warn", want: slog.LevelWarn},
		{input: "error", want: slog.LevelError},
		{input: "", wantErr: ErrUnknownLevel},
		{input: "INFO", wantErr: ErrUnknownLevel},
		{input: "warning", wantErr: ErrUnknownLevel},
		{input: "trace", wantErr: ErrUnknownLevel},
		{input: " info", wantErr: ErrUnknownLevel},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()

			got, err := ParseLevel(tc.input)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("ParseLevel(%q) error = %v, want %v", tc.input, err, tc.wantErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("ParseLevel(%q) error = %v", tc.input, err)
			}

			if got != tc.want {
				t.Fatalf("ParseLevel(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestNewToSelectsHandler(t *testing.T) {
	t.Parallel()

	tests := []struct {
		format string
		check  func(t *testing.T, line string)
	}{
		{
			format: "text",
			check: func(t *testing.T, line string) {
				t.Helper()

				if !strings.Contains(line, "level=INFO") ||
					!strings.Contains(line, `msg=started`) ||
					!strings.Contains(line, "listen=:8080") {
					t.Fatalf(
						"text line = %q, want slog text with level, msg and the attribute",
						line,
					)
				}
			},
		},
		{
			format: "json",
			check: func(t *testing.T, line string) {
				t.Helper()

				var record map[string]any

				err := json.Unmarshal([]byte(line), &record)
				if err != nil {
					t.Fatalf("json line %q does not parse: %v", line, err)
				}

				if record["level"] != "INFO" || record["msg"] != "started" ||
					record["listen"] != ":8080" {
					t.Fatalf("json record = %v, want level INFO, msg started, listen :8080", record)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.format, func(t *testing.T) {
			t.Parallel()

			var out bytes.Buffer

			log, err := NewTo(&out, tc.format, "info")
			if err != nil {
				t.Fatalf("NewTo(%q) error = %v", tc.format, err)
			}

			log.Info("started", "listen", ":8080")
			tc.check(t, strings.TrimSpace(out.String()))
		})
	}
}

func TestNewToFiltersBelowLevel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		level   string
		emitted []string
	}{
		{level: "debug", emitted: []string{"d", "i", "w", "e"}},
		{level: "info", emitted: []string{"i", "w", "e"}},
		{level: "warn", emitted: []string{"w", "e"}},
		{level: "error", emitted: []string{"e"}},
	}

	for _, tc := range tests {
		t.Run(tc.level, func(t *testing.T) {
			t.Parallel()

			var out bytes.Buffer

			log, err := NewTo(&out, "json", tc.level)
			if err != nil {
				t.Fatalf("NewTo(json, %q) error = %v", tc.level, err)
			}

			log.Debug("d")
			log.Info("i")
			log.Warn("w")
			log.Error("e")

			var got []string

			for line := range strings.Lines(out.String()) {
				var record struct {
					Msg string `json:"msg"`
				}

				err = json.Unmarshal([]byte(line), &record)
				if err != nil {
					t.Fatalf("line %q does not parse: %v", line, err)
				}

				got = append(got, record.Msg)
			}

			if strings.Join(got, ",") != strings.Join(tc.emitted, ",") {
				t.Fatalf("level %q emitted %v, want %v", tc.level, got, tc.emitted)
			}
		})
	}
}

func TestNewRejectsUnknownValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		format  string
		level   string
		wantErr error
	}{
		{name: "unknown format", format: "logfmt", level: "info", wantErr: ErrUnknownFormat},
		{name: "empty format", format: "", level: "info", wantErr: ErrUnknownFormat},
		{name: "upper-case format", format: "JSON", level: "info", wantErr: ErrUnknownFormat},
		{name: "unknown level", format: "text", level: "verbose", wantErr: ErrUnknownLevel},
		{name: "both unknown", format: "xml", level: "loud", wantErr: ErrUnknownLevel},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			log, err := New(tc.format, tc.level)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("New(%q, %q) error = %v, want %v", tc.format, tc.level, err, tc.wantErr)
			}

			if log != nil {
				t.Fatalf("New(%q, %q) returned a logger with an error", tc.format, tc.level)
			}
		})
	}
}
