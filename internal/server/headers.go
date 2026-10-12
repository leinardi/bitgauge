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
	"net/http"
	"strconv"
	"strings"
)

// Group is the header set a route group gets (configuration-security.md section 3).
type Group int

const (
	// GroupSPA is the SPA document and its assets, and anything outside the API groups.
	GroupSPA Group = iota
	// GroupAPI is the native API, the compatibility layers and /metrics.
	GroupAPI
)

const (
	// cspStart and cspEnd surround the WebSocket sources of connect-src; together they are
	// the Content-Security-Policy of security.md section 5, on one line.
	cspStart = "default-src 'none'; script-src 'self'; style-src 'self'; " +
		"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'"
	cspEnd = "; worker-src 'self'; manifest-src 'self'; base-uri 'none'; " +
		"form-action 'none'; frame-ancestors 'none'"
	// cspWithoutWebSockets is the policy for a request whose Host is not a valid host.
	cspWithoutWebSockets = cspStart + cspEnd

	maxHostLength  = 253
	maxLabelLength = 63
	maxPort        = 65535
	maxPortDigits  = 5
)

// The constant header values, as shared slices so that setting them allocates nothing;
// net/http only reads header values.
var (
	valueNoSniff           = []string{"nosniff"}
	valueNoStore           = []string{"no-store"}
	valueNoReferrer        = []string{"no-referrer"}
	valuePermissionsPolicy = []string{
		"camera=(), microphone=(), geolocation=(), usb=(), payment=()",
	}
	valueSameOrigin         = []string{"same-origin"}
	valueRequireCORP        = []string{"require-corp"}
	valueDeny               = []string{"DENY"}
	valueCSPWithoutWebSocks = []string{cspWithoutWebSockets}
)

// contentSecurityPolicy is the CSP for a request's Host: connect-src names ws:// and wss://
// for it explicitly, since older Safari versions do not match them with 'self'. A Host that is
// not a hostname or IP literal with an optional port gets the policy without them, so the
// header only ever reflects a well-formed host the browser asked for.
func contentSecurityPolicy(host string) string {
	if !validHost(host) {
		return cspWithoutWebSockets
	}

	return cspStart + " ws://" + host + " wss://" + host + cspEnd
}

// setHeaders sets the header set of group on header.
func setHeaders(header http.Header, group Group, host string) {
	header["X-Content-Type-Options"] = valueNoSniff

	if group == GroupAPI {
		header["Cache-Control"] = valueNoStore

		return
	}

	if csp := contentSecurityPolicy(host); csp == cspWithoutWebSockets {
		header["Content-Security-Policy"] = valueCSPWithoutWebSocks
	} else {
		header["Content-Security-Policy"] = []string{csp}
	}

	header["Referrer-Policy"] = valueNoReferrer
	header["Permissions-Policy"] = valuePermissionsPolicy
	header["Cross-Origin-Opener-Policy"] = valueSameOrigin
	header["Cross-Origin-Embedder-Policy"] = valueRequireCORP
	header["Cross-Origin-Resource-Policy"] = valueSameOrigin
	header["X-Frame-Options"] = valueDeny
}

// validHost reports whether host is a hostname, a DNS name or an IPv4 address, followed by
// an optional port of 1 to 65535 (configuration-security.md section 3). An IPv6 literal is not
// a hostname, and CSP host sources cannot express one; its CSP falls back to 'self'.
func validHost(host string) bool {
	name, port := host, ""
	if index := strings.LastIndex(host, ":"); index >= 0 {
		name, port = host[:index], host[index:]
	}

	return validHostname(name) && (port == "" || validPort(port))
}

// validPort checks ":<port>".
func validPort(port string) bool {
	digits, found := strings.CutPrefix(port, ":")
	if !found || digits == "" || len(digits) > maxPortDigits {
		return false
	}

	for _, char := range digits {
		if char < '0' || char > '9' {
			return false
		}
	}

	number, err := strconv.Atoi(digits)

	return err == nil && number >= 1 && number <= maxPort
}

// validHostname checks a DNS name of letters, digits and hyphens in dot-separated labels of 1
// to 63 characters that neither start nor end with a hyphen; an IPv4 address passes too.
func validHostname(name string) bool {
	if name == "" || len(name) > maxHostLength {
		return false
	}

	for label := range strings.SplitSeq(name, ".") {
		if !validLabel(label) {
			return false
		}
	}

	return true
}

func validLabel(label string) bool {
	if label == "" || len(label) > maxLabelLength ||
		strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
		return false
	}

	for _, char := range label {
		isLetter := (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
		if !isLetter && (char < '0' || char > '9') && char != '-' {
			return false
		}
	}

	return true
}
