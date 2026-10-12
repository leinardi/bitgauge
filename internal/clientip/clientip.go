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

// Package clientip derives a request's client IP: the TCP peer, or, only when the peer is a
// trusted proxy, the first untrusted hop of X-Forwarded-For counted from the right
// (configuration-security.md section 4, security.md section 4). No other forwarding header is
// ever read.
package clientip

import (
	"net/http"
	"net/netip"
	"slices"
	"strings"
)

const (
	// forwardedFor is the only forwarding header read. X-Real-IP, Client-IP, CF-Connecting-IP,
	// CF-Connecting-IPv6 and Forwarded are ignored on purpose: common proxies pass a
	// client-supplied value of them through unchanged.
	forwardedFor = "X-Forwarded-For"
	// entrySeparator separates the hops of one X-Forwarded-For line, and joins several lines.
	entrySeparator = ","
)

// Deriver derives client IPs for one set of trusted proxy ranges. It holds no per-request state
// and is safe for concurrent use.
type Deriver struct {
	trusted []netip.Prefix
}

// NewDeriver returns a Deriver trusting the given ranges (server.trusted_proxies). With none,
// forwarding headers are never believed.
func NewDeriver(trusted []netip.Prefix) *Deriver {
	return &Deriver{trusted: append([]netip.Prefix(nil), trusted...)}
}

// FromRequest returns the request's client IP, normalised: no port, no IPv6 zone, and an
// IPv4-mapped IPv6 address as plain IPv4. It returns the zero Addr only when the peer address
// itself cannot be parsed, which a TCP listener never produces.
func (d *Deriver) FromRequest(request *http.Request) netip.Addr {
	peer := peerAddr(request.RemoteAddr)
	if !peer.IsValid() || !d.isTrusted(peer) {
		return peer
	}

	lines := request.Header.Values(forwardedFor)
	if len(lines) == 0 {
		return peer
	}

	entries := strings.Split(strings.Join(lines, entrySeparator), entrySeparator)

	var leftmost netip.Addr

	for _, entrie := range slices.Backward(entries) {
		addr, err := netip.ParseAddr(strings.TrimSpace(entrie))
		if err != nil {
			// A malformed chain fails closed to the proxy's own address: nothing to the left
			// of a hop that does not parse can be attributed to anyone.
			return peer
		}

		addr = normalize(addr)
		if !d.isTrusted(addr) {
			return addr
		}

		leftmost = addr
	}

	return leftmost
}

func (d *Deriver) isTrusted(addr netip.Addr) bool {
	for _, prefix := range d.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}

// peerAddr parses the TCP peer of http.Request.RemoteAddr, which is host:port.
func peerAddr(remoteAddr string) netip.Addr {
	addrPort, err := netip.ParseAddrPort(remoteAddr)
	if err != nil {
		return netip.Addr{}
	}

	return normalize(addrPort.Addr())
}

// normalize removes the IPv6 zone and turns an IPv4-mapped address into IPv4, so that one
// client has one address whatever path it took (security.md section 4).
func normalize(addr netip.Addr) netip.Addr {
	return addr.WithZone("").Unmap()
}
