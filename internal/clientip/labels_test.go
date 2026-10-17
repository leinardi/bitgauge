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

func TestLabelerLongestPrefixWins(t *testing.T) {
	t.Parallel()

	labeler := NewLabeler([]Rule{
		{Prefix: netip.MustParsePrefix("10.0.0.0/8"), Label: "LAN"},
		{Prefix: netip.MustParsePrefix("10.8.0.0/24"), Label: "WireGuard"},
		{Prefix: netip.MustParsePrefix("10.8.0.0/16"), Label: "Office"},
		{Prefix: netip.MustParsePrefix("fd00:1::/64"), Label: "Lab"},
		{Prefix: netip.MustParsePrefix("203.0.113.0/24"), Label: "Branch"},
	})

	for addr, want := range map[string]Label{
		"10.8.0.7":    "WireGuard",
		"10.8.1.7":    "Office",
		"10.9.0.7":    "LAN",
		"fd00:1::5":   "Lab",
		"203.0.113.9": "Branch",
		// IPv4-mapped IPv6 is normalized to IPv4 before matching.
		"::ffff:10.8.0.7": "WireGuard",
		// No rule matches: the address-class rule applies.
		"192.168.1.20":      LabelLAN,
		"100.64.0.1":        LabelVPN,
		"fd7a:115c:a1e0::1": LabelVPN,
		"fd00:2::5":         LabelLAN,
		"198.51.100.1":      LabelNone,
	} {
		if got := labeler.Suggest(netip.MustParseAddr(addr)); got != want {
			t.Errorf("Suggest(%s) = %q, want %q", addr, got, want)
		}
	}
}

func TestLabelerWithoutRulesIsTheAddressClassRule(t *testing.T) {
	t.Parallel()

	var none *Labeler

	for _, labeler := range []*Labeler{none, NewLabeler(nil)} {
		for _, addr := range []string{"10.0.0.1", "100.64.0.1", "8.8.8.8", "::1"} {
			parsed := netip.MustParseAddr(addr)
			if got := labeler.Suggest(parsed); got != SuggestedLabel(parsed) {
				t.Errorf("Suggest(%s) = %q, want the address-class %q", addr, got,
					SuggestedLabel(parsed))
			}
		}
	}
}

func TestNewLabelerKeepsTheCallersRules(t *testing.T) {
	t.Parallel()

	rules := []Rule{
		{Prefix: netip.MustParsePrefix("10.0.0.0/8"), Label: "LAN"},
		{Prefix: netip.MustParsePrefix("10.8.0.0/24"), Label: "VPN"},
	}
	NewLabeler(rules)

	if rules[0].Label != "LAN" {
		t.Fatal("NewLabeler reordered the caller's slice")
	}
}
