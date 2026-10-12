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

package main

import (
	"context"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
)

// healthcheckTimeout bounds the health check's one request (backend.md section 6).
const healthcheckTimeout = 3 * time.Second

// healthcheck asks the server the configuration describes for GET /api/v1/ping and returns 0
// when it answers 204, 1 otherwise.
func healthcheck(ctx context.Context, cfg *config.Config) int {
	if pingAnswers(ctx, healthcheckURL(cfg), healthcheckTimeout) {
		return 0
	}

	return exitFailure
}

// healthcheckURL is the ping URL under the base path at the address server.listen describes:
// its host when that is a specific address, 127.0.0.1 for an empty or 0.0.0.0 host, and ::1
// for :: (backend.md section 6).
func healthcheckURL(cfg *config.Config) string {
	host := cfg.Server.Listen.Host
	addr, err := netip.ParseAddr(host)

	switch {
	case host == "":
		host = "127.0.0.1"
	case err == nil && addr.Is6() && !addr.Is4In6() && addr.IsUnspecified():
		host = "::1"
	case err == nil && addr.Unmap().IsUnspecified():
		host = "127.0.0.1"
	}

	base := strings.TrimSuffix(cfg.Server.BasePath, "/")

	return "http://" + net.JoinHostPort(host, strconv.Itoa(cfg.Server.Listen.Port)) + base +
		handlers.Prefix + "/ping"
}
