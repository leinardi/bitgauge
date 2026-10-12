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

package config

import "fmt"

// Warnings returns the settings that are valid but probably unintended (configuration.md
// section 4). They are logged at warn and never stop startup.
func Warnings(cfg *Config) []Problem {
	var warnings []Problem

	if cfg.Metrics.Enabled && len(cfg.Server.TrustedProxies) == 0 {
		warnings = append(warnings, Problem{
			Key:   "metrics.enabled",
			Value: "true",
			Rule: "metrics are on with no server.trusted_proxies, so the unauthenticated metrics " +
				"endpoint is probably reachable directly; restrict it at the proxy",
		})
	}

	for index, prefix := range cfg.Server.TrustedProxies {
		// A /0 trusts every peer, IPv4 or IPv6, so any client can choose its own address.
		if prefix.IsValid() && prefix.Bits() == 0 {
			warnings = append(warnings, Problem{
				Key:   fmt.Sprintf("server.trusted_proxies[%d]", index),
				Value: prefix.String(),
				Rule: "trusts every address, so any client can set its own IP through " +
					"X-Forwarded-For and escape the per-client limits",
			})
		}
	}

	return warnings
}
