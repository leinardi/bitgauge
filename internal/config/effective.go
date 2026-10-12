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

import (
	"log/slog"

	"github.com/knadh/koanf/providers/structs"
	"github.com/knadh/koanf/v2"
)

const trustedProxiesKey = "server.trusted_proxies"

// Effective returns the configuration as one log attribute per key, sorted by key, for the
// startup line at info (configuration-security.md section 6). Nothing in it is secret.
func Effective(cfg *Config) []slog.Attr {
	flat := koanf.New(keyDelimiter)

	err := flat.Load(structs.Provider(*cfg, structTag), nil)
	if err != nil {
		return []slog.Attr{slog.String("error", err.Error())}
	}

	keys := flat.Keys()
	attrs := make([]slog.Attr, 0, len(keys))

	for _, key := range keys {
		value := flat.Get(key)
		// The structs provider cannot see inside netip.Prefix, so the list is taken as is.
		if key == trustedProxiesKey {
			value = cfg.Server.TrustedProxies
		}

		attrs = append(attrs, slog.Any(key, value))
	}

	return attrs
}

// MarshalText writes the address as host:port, so that a log line shows it as configured.
func (l Listen) MarshalText() ([]byte, error) {
	return []byte(l.String()), nil
}

// MarshalText writes the duration, or nothing when it is unset.
func (d OptionalDuration) MarshalText() ([]byte, error) {
	if !d.Set {
		return []byte{}, nil
	}

	return []byte(d.Duration.String()), nil
}

// MarshalText writes auto or the fixed duration.
func (w Warmup) MarshalText() ([]byte, error) {
	if w.Auto {
		return []byte(warmupAuto), nil
	}

	return []byte(w.Duration.String()), nil
}
