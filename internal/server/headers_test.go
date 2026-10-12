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

package server

import (
	"bufio"
	"net/http"
	"os"
	"strings"
	"testing"
)

// specHeaders reads the SPA header block of security.md section 5, joining the CSP's
// continuation lines with one space, so the test compares against the document itself.
func specHeaders(t *testing.T) map[string]string {
	t.Helper()

	file, err := os.Open("../../docs/features/security.md")
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = file.Close() })

	headers := map[string]string{}
	inSection, inBlock, last := false, false, ""
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case strings.HasPrefix(line, "## "):
			inSection = strings.HasPrefix(line, "## 5. ")
		case inSection && line == "```text":
			inBlock = true
		case inBlock && line == "```":
			return headers
		case inBlock && strings.HasPrefix(line, "  "):
			headers[last] += " " + strings.TrimSpace(line)
		case inBlock:
			name, value, _ := strings.Cut(line, ": ")
			headers[name], last = value, name
		}
	}

	t.Fatal("no header block in security.md section 5")

	return nil
}

func TestSPAHeadersMatchSecurityMD(t *testing.T) {
	t.Parallel()

	spec := specHeaders(t)
	if len(spec) != 8 {
		t.Fatalf("security.md section 5 lists %d headers, want 8: %v", len(spec), spec)
	}

	for _, host := range []string{"speed.example", "speed.example:8443", "127.0.0.1:8080", "localhost"} {
		header := http.Header{}
		setHeaders(header, GroupSPA, host)

		if len(header) != len(spec) {
			t.Fatalf("%s: %d headers set, want %d: %v", host, len(header), len(spec), header)
		}

		for name, want := range spec {
			want = strings.ReplaceAll(want, "<host>", host)
			if got := header.Values(name); len(got) != 1 || got[0] != want {
				t.Fatalf("%s: %s = %q\nwant %q", host, name, got, want)
			}
		}
	}
}

func TestCSPWithoutWebSocketsForAnInvalidHost(t *testing.T) {
	t.Parallel()

	want := strings.ReplaceAll(specHeaders(t)["Content-Security-Policy"],
		" ws://<host> wss://<host>", "")

	for _, host := range []string{
		"", "evil.example; script-src *", "a b", "exa_mple.com", "-bad.example", "bad-.example",
		"bad..example", ".example", "example.", "host:", "host:0", "host:65536", "host:123456",
		"host:8a", "[::1", "[::1]x", "[fe80::1%25eth0]", "[127.0.0.1]", "::1", "ex\"ample",
		// IPv6 literals are not hostnames, and CSP host sources cannot name them.
		"[::1]", "[::1]:8080", "[2001:db8::1]",
		strings.Repeat("a", 64) + ".example", strings.Repeat("a.", 127) + "aa",
	} {
		header := http.Header{}
		setHeaders(header, GroupSPA, host)

		if got := header.Get("Content-Security-Policy"); got != want {
			t.Fatalf("host %q: CSP = %q\nwant %q", host, got, want)
		}
	}
}

func TestAPIHeaders(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	setHeaders(header, GroupAPI, "speed.example")

	want := http.Header{
		"X-Content-Type-Options": {"nosniff"},
		"Cache-Control":          {"no-store"},
	}

	if len(header) != len(want) ||
		header.Get(
			"X-Content-Type-Options",
		) != "nosniff" || header.Get("Cache-Control") != "no-store" {
		t.Fatalf("API headers = %v, want %v", header, want)
	}
}
