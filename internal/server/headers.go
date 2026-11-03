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

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// Group is the route group the security-header classifier puts a request in, which decides
// its header set and its error format (configuration-security.md section 3).
type Group int

const (
	// GroupSPA is the SPA document and its assets, and anything outside the other groups.
	GroupSPA Group = iota
	// GroupAPI is the native API and /metrics.
	GroupAPI
	// GroupOpenSpeedTest is an enabled OpenSpeedTest layer's exact route paths.
	GroupOpenSpeedTest
	// GroupLibreSpeed is an enabled LibreSpeed layer's exact route paths.
	GroupLibreSpeed
	// GroupNQ is an enabled networkQuality layer's exact route paths.
	GroupNQ
)

// metricsGroup is the group label of a request in g that no route matched (backend.md
// section 7).
func (g Group) metricsGroup() metrics.Group {
	switch g {
	case GroupAPI:
		return metrics.GroupAPI
	case GroupOpenSpeedTest:
		return metrics.GroupOpenSpeedTest
	case GroupLibreSpeed:
		return metrics.GroupLibreSpeed
	case GroupNQ:
		return metrics.GroupNQ
	case GroupSPA:
		return metrics.GroupSPA
	}

	return metrics.GroupSPA
}

const (
	// styleHash allows the one inline style the SPA inserts, the fixed <style> of reka-ui's
	// SelectViewport that hides the list's scrollbar, by its SHA-256, so 'unsafe-inline' stays out
	// (security.md section 5). web/src/lib/csp.test.ts hashes the installed package's text, so an
	// upgrade that changes it fails until this is updated.
	styleHash = "'sha256-60LHlRjW/B3CtzIoE/Lf1/NEDvko9efWMFaGVhHu/cs='"
	// cspStart and cspEnd surround the WebSocket sources of connect-src; together they are
	// the Content-Security-Policy of security.md section 5, on one line.
	cspStart = "default-src 'none'; script-src 'self'; style-src 'self' " + styleHash + "; " +
		"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'"
	cspEnd = "; worker-src 'self'; manifest-src 'self'; base-uri 'none'; " +
		"form-action 'none'; frame-ancestors 'none'"
	// cspWithoutWebSockets is the policy for a request whose Host is not a valid host.
	cspWithoutWebSockets = cspStart + cspEnd
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
	if !handlers.ValidHost(host) {
		return cspWithoutWebSockets
	}

	return cspStart + " ws://" + host + " wss://" + host + cspEnd
}

// setHeaders sets the header set of group on header: every group but the SPA's gets the API
// set.
func setHeaders(header http.Header, group Group, host string) {
	header["X-Content-Type-Options"] = valueNoSniff

	if group != GroupSPA {
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
