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

package handlers

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/config"
)

// Prefix is the path the native API is mounted at, under server.base_path.
const Prefix = "/api/v1"

// Deps are what the native handlers are built from, created once at startup (backend.md
// section 5): the validated configuration, the build information, and the shared random
// buffer and epoch.
type Deps struct {
	Config *config.Config
	Buffer *Buffer
	Build  buildinfo.Build
	Epoch  Epoch
}

// routeTable registers routes and remembers each path's methods, so the 405 answer can name
// them in Allow: chi only sets Allow in its own 405 handler, which a custom one replaces.
type routeTable struct {
	router *chi.Mux
	allow  map[string]string
}

func (t *routeTable) handle(pattern string, handler http.HandlerFunc, methods ...string) {
	for _, method := range methods {
		t.router.MethodFunc(method, pattern, handler)
	}

	t.allow[pattern] = strings.Join(methods, ", ")
}

// Routes returns the router of the native API (wire-protocol.md section 2), to be mounted at
// Prefix. Any other method on a known path answers 405 with Allow, and any unknown path
// answers 404, both with the error envelope.
func Routes(deps *Deps) *chi.Mux {
	table := &routeTable{router: chi.NewRouter(), allow: map[string]string{}}

	table.handle(
		"/download",
		Download(deps.Buffer, int64(deps.Config.Limits.MaxDownloadBytes)),
		http.MethodGet,
	)
	table.handle("/ping", Ping, http.MethodGet, http.MethodHead)
	table.handle("/small", Small, http.MethodGet)
	table.handle("/info", Info(deps.Config, deps.Build, deps.Epoch), http.MethodGet)

	table.router.NotFound(func(writer http.ResponseWriter, _ *http.Request) {
		WriteError(writer, http.StatusNotFound, CodeNotFound, "not found", nil)
	})
	table.router.MethodNotAllowed(func(writer http.ResponseWriter, request *http.Request) {
		allow := table.allow[routePath(request)]
		if allow != "" {
			writer.Header().Set("Allow", allow)
		}

		WriteError(
			writer,
			http.StatusMethodNotAllowed,
			CodeMethodNotAllowed,
			"method not allowed",
			nil,
		)
	})

	return table.router
}

// routePath is the path chi routed on: the part below the mount point, or the whole path
// when the router is not mounted.
func routePath(request *http.Request) string {
	if routeContext := chi.RouteContext(request.Context()); routeContext != nil &&
		routeContext.RoutePath != "" {
		return routeContext.RoutePath
	}

	if request.URL.RawPath != "" {
		return request.URL.RawPath
	}

	return request.URL.Path
}
