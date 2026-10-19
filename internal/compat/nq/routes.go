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

// Package nq is the Apple networkQuality compatibility layer (compatibility.md section 3): the
// config and the three test routes macOS's and iOS's networkQuality tool and compatible clients
// drive, under their own /nq/ prefix, translated onto the native building blocks of package
// handlers. It is mounted only when compat.networkquality.enabled is set.
package nq

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// The layer's paths (compatibility.md section 3.1).
const (
	ConfigPath    = "/nq/config"
	WellKnownPath = "/.well-known/nq"
	SmallPath     = "/nq/small"
	LargePath     = "/nq/large"
	UploadPath    = "/nq/upload"
)

// allow is the Allow value of each path's route-table row (compatibility.md section 5): the
// layer has no HEAD and no OPTIONS.
var allow = map[string]string{
	ConfigPath:    http.MethodGet,
	WellKnownPath: http.MethodGet,
	SmallPath:     http.MethodGet,
	LargePath:     http.MethodGet,
	UploadPath:    http.MethodPost,
}

// Deps are what the layer is built from, created once at startup.
type Deps struct {
	// Config is the validated configuration: server.public_url and base_path for the config's
	// URLs, and compat.networkquality.max_upload_bytes.
	Config *config.Config
	// Buffer is the shared random buffer /nq/large is cut from.
	Buffer *handlers.Buffer
	// FlowLimit wraps /nq/large and /nq/upload in the per-client flow limit,
	// compat.networkquality.max_flows_per_client; nil leaves them unlimited.
	FlowLimit func(http.Handler) http.Handler
	// Now is the clock an upload's lifetime starts from at handler entry; nil is time.Now.
	Now func() time.Time
	// Download and Upload count the transfers under the layer's metrics group.
	Download metrics.Transfer
	Upload   metrics.Transfer
}

// Routes returns the layer's router, whose routes are the exact paths and methods of its
// route-table rows (compatibility.md section 5), to be mounted under server.base_path. It sends
// no CORS headers and never redirects; a method a row does not list, OPTIONS included, answers
// 405 with Allow and the error envelope.
func Routes(deps *Deps) *chi.Mux {
	limit := deps.FlowLimit
	if limit == nil {
		limit = func(next http.Handler) http.Handler { return next }
	}

	now := deps.Now
	if now == nil {
		now = time.Now
	}

	cfg := deps.Config
	settings := Config(string(cfg.Server.PublicURL), cfg.Server.BasePath)

	router := chi.NewRouter()
	router.NotFound(http.NotFound)
	router.MethodNotAllowed(methodNotAllowed)

	router.Method(http.MethodGet, ConfigPath, settings)
	router.Method(http.MethodGet, WellKnownPath, settings)
	router.MethodFunc(http.MethodGet, SmallPath, handlers.Small)
	router.Method(http.MethodGet, LargePath, limit(Large(deps.Buffer, deps.Download)))
	router.Method(http.MethodPost, UploadPath,
		limit(Upload(now, int64(cfg.Compat.NetworkQuality.MaxUploadBytes), deps.Upload)))

	return router
}

// methodNotAllowed answers a method the path's row does not list.
func methodNotAllowed(writer http.ResponseWriter, request *http.Request) {
	path := request.URL.Path
	if routeContext := chi.RouteContext(request.Context()); routeContext.RoutePath != "" {
		path = routeContext.RoutePath
	}

	if value, found := allow[path]; found {
		writer.Header().Set("Allow", value)
	}

	handlers.WriteError(writer, http.StatusMethodNotAllowed, handlers.CodeMethodNotAllowed,
		"method not allowed", nil)
}
