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

package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/leinardi/bitgauge/internal/clientip"
)

const (
	maxHostLength  = 253
	maxLabelLength = 63
	maxPort        = 65535
	maxPortDigits  = 5

	schemeHTTP  = "http"
	schemeHTTPS = "https"
	// listSeparator separates the values of a forwarding header a chain of proxies extended.
	listSeparator = ","
)

// RequestOrigin is the one builder of the absolute URLs of the compatibility layers
// (compatibility.md section 6): the origin clients use, followed by basePath without its
// trailing slash, and whether that origin is https. publicURL, server.public_url, wins when it
// is set. Otherwise, for a request whose TCP peer is a trusted proxy (clientip.PeerTrusted),
// the scheme is the first comma-separated value of X-Forwarded-Proto, trimmed and lower-cased,
// http when it is absent or neither http nor https; the host is the first value of
// X-Forwarded-Host, trimmed, when it passes ValidHost, and the request's Host otherwise. Any
// other request gets http and its own Host: forwarding headers from an untrusted peer are never
// read.
func RequestOrigin(request *http.Request, publicURL, basePath string) (string, bool) {
	base := strings.TrimSuffix(basePath, "/")

	if publicURL != "" {
		origin := strings.TrimSuffix(publicURL, "/")
		secure := strings.HasPrefix(strings.ToLower(origin), schemeHTTPS+"://")

		return origin + base, secure
	}

	scheme, host := schemeHTTP, request.Host

	if clientip.PeerTrusted(request.Context()) {
		forwarded := strings.ToLower(firstValue(request.Header.Get("X-Forwarded-Proto")))
		if forwarded == schemeHTTP || forwarded == schemeHTTPS {
			scheme = forwarded
		}

		if forwardedHost := firstValue(request.Header.Get("X-Forwarded-Host")); ValidHost(
			forwardedHost,
		) {
			host = forwardedHost
		}
	}

	return scheme + "://" + host + base, scheme == schemeHTTPS
}

// firstValue is the first comma-separated value of a forwarding header, trimmed: the one the
// proxy closest to the client wrote.
func firstValue(header string) string {
	first, _, _ := strings.Cut(header, listSeparator)

	return strings.TrimSpace(first)
}

// ValidHost reports whether host is a hostname, a DNS name or an IPv4 address, followed by an
// optional port of 1 to 65535 (configuration-security.md section 3): the check the CSP's Host
// and a forwarded host both pass before use. An IPv6 literal is not a hostname, and CSP host
// sources cannot express one.
func ValidHost(host string) bool {
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
