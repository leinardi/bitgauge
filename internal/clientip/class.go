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

package clientip

import "net/netip"

// Class is the address class of GET /api/v1/info's client.addressClass (wire-protocol.md
// section 5).
type Class string

// The address classes.
const (
	ClassLoopback  Class = "loopback"
	ClassPrivate   Class = "private"
	ClassLinkLocal Class = "link-local"
	ClassULA       Class = "ula"
	ClassCGNAT     Class = "cgnat"
	ClassPublic    Class = "public"
)

// Label is a suggested context label (wire-protocol.md section 5). LabelNone is the absent
// suggestion, sent as null.
type Label string

// The suggested labels.
const (
	LabelLAN  Label = "LAN"
	LabelVPN  Label = "VPN"
	LabelNone Label = ""
)

const (
	ipv4 = 4
	ipv6 = 6
)

var (
	// rfc1918 are the private IPv4 ranges. netip.Addr.IsPrivate is not used because it also
	// counts fc00::/7, which is its own class here.
	rfc1918 = []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("172.16.0.0/12"),
		netip.MustParsePrefix("192.168.0.0/16"),
	}
	ula   = netip.MustParsePrefix("fc00::/7")
	cgnat = netip.MustParsePrefix("100.64.0.0/10")
	// tailscale is the ULA range Tailscale assigns, which is a VPN rather than a LAN.
	tailscale = netip.MustParsePrefix("fd7a:115c:a1e0::/48")
)

// AddressClass returns the class of a normalized client address. Anything that is not
// loopback, link-local, CGNAT, RFC 1918 or ULA is public.
func AddressClass(addr netip.Addr) Class {
	addr = normalize(addr)

	switch {
	case addr.IsLoopback():
		return ClassLoopback
	case addr.IsLinkLocalUnicast():
		return ClassLinkLocal
	case cgnat.Contains(addr):
		return ClassCGNAT
	case containsAny(rfc1918, addr):
		return ClassPrivate
	case ula.Contains(addr):
		return ClassULA
	default:
		return ClassPublic
	}
}

// SuggestedLabel returns the context label suggested for a client address: VPN for CGNAT and
// the Tailscale ULA range, LAN for private, link-local, other ULA and loopback addresses, and
// none for public ones.
func SuggestedLabel(addr netip.Addr) Label {
	addr = normalize(addr)
	if tailscale.Contains(addr) {
		return LabelVPN
	}

	switch AddressClass(addr) {
	case ClassCGNAT:
		return LabelVPN
	case ClassPrivate, ClassLinkLocal, ClassULA, ClassLoopback:
		return LabelLAN
	case ClassPublic:
		return LabelNone
	default:
		return LabelNone
	}
}

// Version returns 4 or 6, the client.ipVersion of GET /api/v1/info.
func Version(addr netip.Addr) int {
	if normalize(addr).Is4() {
		return ipv4
	}

	return ipv6
}

func containsAny(prefixes []netip.Prefix, addr netip.Addr) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}

	return false
}
