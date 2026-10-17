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
	"cmp"
	"net/netip"
	"slices"
)

// Rule maps a client subnet to the label suggested for it: one server.labels entry, its prefix
// masked and not IPv4-mapped, as configuration validation guarantees.
type Rule struct {
	Prefix netip.Prefix
	Label  Label
}

// Labeler suggests the context label of GET /api/v1/info (wire-protocol.md section 5): the label
// of the longest configured prefix that contains the client address, else the address-class
// rule of SuggestedLabel. It is built once at startup and only read afterwards. A nil *Labeler
// has no rules.
type Labeler struct {
	rules []Rule
}

// NewLabeler holds rules longest prefix first, so the first rule that contains an address is
// its longest match.
func NewLabeler(rules []Rule) *Labeler {
	sorted := slices.Clone(rules)
	slices.SortStableFunc(sorted, func(left, right Rule) int {
		return cmp.Compare(right.Prefix.Bits(), left.Prefix.Bits())
	})

	return &Labeler{rules: sorted}
}

// Suggest returns the label suggested for a client address, IPv4-mapped IPv6 normalized to
// IPv4 first.
func (l *Labeler) Suggest(addr netip.Addr) Label {
	addr = normalize(addr)

	if l != nil {
		for _, rule := range l.rules {
			if rule.Prefix.Contains(addr) {
				return rule.Label
			}
		}
	}

	return SuggestedLabel(addr)
}
