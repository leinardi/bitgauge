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

package testenv

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
)

// Secret wraps a sensitive string, such as a registry token. A redacting logger replaces it with a
// placeholder, and so does fmt.
type Secret string

// String returns the placeholder, so a Secret formatted by mistake does not leak.
func (Secret) String() string { return redacted }

// GoString returns the placeholder for %#v as well.
func (Secret) GoString() string { return redacted }

const redacted = "[redacted]"

// NewLogger returns a logger that replaces any attribute keyed "secret", any Secret value and the
// value of any KEY=VALUE docker environment argument with a placeholder.
func NewLogger(out io.Writer) *slog.Logger {
	handler := slog.NewTextHandler(out, &slog.HandlerOptions{Level: slog.LevelDebug})

	return slog.New(&redactingHandler{inner: handler})
}

type redactingHandler struct {
	inner slog.Handler
}

func (h *redactingHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

//nolint:gocritic // hugeParam: slog.Record is large, but the signature is fixed by slog.Handler.
func (h *redactingHandler) Handle(ctx context.Context, record slog.Record) error {
	cleaned := slog.NewRecord(record.Time, record.Level, record.Message, record.PC)
	record.Attrs(func(attr slog.Attr) bool {
		cleaned.AddAttrs(redactAttr(attr))

		return true
	})

	err := h.inner.Handle(ctx, cleaned)
	if err != nil {
		return fmt.Errorf("inner slog handler: %w", err)
	}

	return nil
}

func (h *redactingHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	cleaned := make([]slog.Attr, len(attrs))
	for index, attr := range attrs {
		cleaned[index] = redactAttr(attr)
	}

	return &redactingHandler{inner: h.inner.WithAttrs(cleaned)}
}

func (h *redactingHandler) WithGroup(name string) slog.Handler {
	return &redactingHandler{inner: h.inner.WithGroup(name)}
}

func redactAttr(attr slog.Attr) slog.Attr {
	if attr.Key == "secret" {
		return slog.String(attr.Key, redacted)
	}

	switch value := attr.Value.Any().(type) {
	case Secret:
		return slog.String(attr.Key, redacted)
	case []string:
		return slog.Any(attr.Key, RedactArgs(value))
	}

	return attr
}

// RedactArgs returns docker arguments safe to log: the value of every -e/--env KEY=VALUE, and of
// every --build-arg and --secret, is replaced, keeping the key so the log still says what was set.
func RedactArgs(args []string) []string {
	cleaned := make([]string, len(args))

	redactNext := false

	for index, arg := range args {
		switch {
		case redactNext:
			cleaned[index] = redactValue(arg)
			redactNext = false
		case arg == "-e" || arg == "--env" || arg == "--build-arg" || arg == "--secret":
			cleaned[index] = arg
			redactNext = true
		case hasValuePrefix(arg, "--env=", "--build-arg=", "--secret="):
			flag, value, _ := strings.Cut(arg, "=")
			cleaned[index] = flag + "=" + redactValue(value)
		default:
			cleaned[index] = arg
		}
	}

	return cleaned
}

func hasValuePrefix(arg string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(arg, prefix) {
			return true
		}
	}

	return false
}

func redactValue(value string) string {
	key, _, found := strings.Cut(value, "=")
	if !found {
		return redacted
	}

	return key + "=" + redacted
}
