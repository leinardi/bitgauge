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

// Package server builds the http.Server: its timeouts, the global middleware chain of
// backend.md section 3 and the security headers of security.md section 5.
package server

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

const (
	// ReadHeaderTimeout bounds reading a request's headers (backend.md section 5).
	ReadHeaderTimeout = 10 * time.Second
	// IdleTimeout closes a keep-alive connection idle for this long.
	IdleTimeout = 120 * time.Second
	// MaxHeaderBytes bounds a request's headers.
	MaxHeaderBytes = 16 << 10
)

// Deps are what the server is built from at startup: the routed handler (the router of the
// route groups), the client IP deriver, the clock and the metrics, which nil leaves out.
type Deps struct {
	Handler http.Handler
	Deriver *clientip.Deriver
	Clock   ratelimit.Clock
	Metrics *metrics.Metrics
}

// New returns the server for cfg. There is no global read or write timeout: throughput
// routes run for minutes and set their own deadlines per request through
// http.ResponseController (backend.md section 2).
func New(cfg *config.Config, log *slog.Logger, deps *Deps) *http.Server {
	return &http.Server{
		Addr: cfg.Server.Listen.String(),
		Handler: Chain(
			deps.Handler,
			deps.Deriver,
			NewClassifier(cfg, LayerPaths(cfg)),
			deps.Clock,
			log,
			NewObserver(cfg, deps.Metrics),
		),
		ReadHeaderTimeout: ReadHeaderTimeout,
		IdleTimeout:       IdleTimeout,
		MaxHeaderBytes:    MaxHeaderBytes,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelError),
	}
}

// NewClassifier puts the native API under base_path, and /metrics when it is enabled, in the
// API group, and each exact route path of an enabled compatibility layer, given without
// base_path in layers, in that layer's group; everything else, a disabled layer's paths
// included, is the SPA group (configuration-security.md section 3).
func NewClassifier(cfg *config.Config, layers map[Group][]string) Classifier {
	base := strings.TrimSuffix(cfg.Server.BasePath, "/")
	apiPrefix := base + handlers.Prefix
	metricsPath := ""

	if cfg.Metrics.Enabled {
		metricsPath = base + cfg.Metrics.Path
	}

	layerOf := map[string]Group{}

	for group, paths := range layers {
		for _, path := range paths {
			layerOf[base+path] = group
		}
	}

	return func(request *http.Request) Group {
		path := request.URL.Path
		if path == apiPrefix || strings.HasPrefix(path, apiPrefix+"/") ||
			(metricsPath != "" && path == metricsPath) {
			return GroupAPI
		}

		if group, found := layerOf[path]; found {
			return group
		}

		return GroupSPA
	}
}
