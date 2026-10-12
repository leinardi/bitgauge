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

import (
	"net/netip"
	"testing"
)

// The ranges of wire-protocol.md section 5: each class at its edges, the Tailscale ULA range, and
// the neighbors that fall outside.
var classCases = []struct {
	addr  string
	class Class
	label Label
}{
	{"127.0.0.1", ClassLoopback, LabelLAN},
	{"127.255.255.254", ClassLoopback, LabelLAN},
	{"::1", ClassLoopback, LabelLAN},
	{"10.0.0.0", ClassPrivate, LabelLAN},
	{"10.255.255.255", ClassPrivate, LabelLAN},
	{"172.16.0.1", ClassPrivate, LabelLAN},
	{"172.31.255.255", ClassPrivate, LabelLAN},
	{"172.32.0.1", ClassPublic, LabelNone},
	{"172.15.255.255", ClassPublic, LabelNone},
	{"192.168.1.42", ClassPrivate, LabelLAN},
	{"192.169.0.1", ClassPublic, LabelNone},
	{"169.254.0.1", ClassLinkLocal, LabelLAN},
	{"169.254.255.254", ClassLinkLocal, LabelLAN},
	{"fe80::1", ClassLinkLocal, LabelLAN},
	{"febf::1", ClassLinkLocal, LabelLAN},
	{"fec0::1", ClassPublic, LabelNone},
	{"fc00::1", ClassULA, LabelLAN},
	{"fd00::2", ClassULA, LabelLAN},
	{"fdff:ffff::1", ClassULA, LabelLAN},
	{"fd7a:115c:a1e0::1", ClassULA, LabelVPN},
	{"fd7a:115c:a1e0:ffff::1", ClassULA, LabelVPN},
	{"fd7a:115c:a1e1::1", ClassULA, LabelLAN},
	{"100.64.0.0", ClassCGNAT, LabelVPN},
	{"100.101.4.17", ClassCGNAT, LabelVPN},
	{"100.127.255.255", ClassCGNAT, LabelVPN},
	{"100.63.255.255", ClassPublic, LabelNone},
	{"100.128.0.0", ClassPublic, LabelNone},
	{"203.0.113.9", ClassPublic, LabelNone},
	{"8.8.8.8", ClassPublic, LabelNone},
	{"2001:db8::1", ClassPublic, LabelNone},
	{"::ffff:192.168.1.42", ClassPrivate, LabelLAN},
	{"::ffff:100.64.0.1", ClassCGNAT, LabelVPN},
	{"fe80::1%eth0", ClassLinkLocal, LabelLAN},
}

func TestAddressClass(t *testing.T) {
	t.Parallel()

	for _, tc := range classCases {
		if got := AddressClass(netip.MustParseAddr(tc.addr)); got != tc.class {
			t.Errorf("AddressClass(%s) = %q, want %q", tc.addr, got, tc.class)
		}
	}
}

func TestSuggestedLabel(t *testing.T) {
	t.Parallel()

	for _, tc := range classCases {
		if got := SuggestedLabel(netip.MustParseAddr(tc.addr)); got != tc.label {
			t.Errorf("SuggestedLabel(%s) = %q, want %q", tc.addr, got, tc.label)
		}
	}
}

func TestVersion(t *testing.T) {
	t.Parallel()

	tests := map[string]int{"10.0.0.1": 4, "::ffff:10.0.0.1": 4, "::1": 6, "fe80::1%eth0": 6}
	for addr, want := range tests {
		if got := Version(netip.MustParseAddr(addr)); got != want {
			t.Errorf("Version(%s) = %d, want %d", addr, got, want)
		}
	}
}
