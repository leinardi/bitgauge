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

// Package librespeed is the LibreSpeed compatibility layer (compatibility.md section 2): the
// routes LibreSpeed's web UI, librespeed-cli and self-built Android apps drive, in the four
// spellings LibreSpeed's Go server answers, translated onto the native building blocks of
// package handlers. It is mounted only when compat.librespeed.enabled is set.
package librespeed

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// WellKnownPath is the BitGauge convention that lists this instance for librespeed-cli
// (compatibility.md section 2.4).
const WellKnownPath = "/.well-known/librespeed"

// The bare names of the three LibreSpeed routes, which the server list also gives as paths
// relative to its server (section 2.3).
const (
	nameGarbage = "garbage"
	nameEmpty   = "empty"
	nameGetIP   = "getIP"
)

// kind is a route of the layer, whichever of its four spellings a request used.
type kind int

const (
	kindNone kind = iota
	kindGarbage
	kindEmpty
	kindGetIP
	kindWellKnown
)

// spellings maps every path of the layer to its route: each bare name, with the backend/
// prefix, the .php suffix, and both, as LibreSpeed's Go server answers them (section 2.1).
var spellings = func() map[string]kind {
	paths := map[string]kind{WellKnownPath: kindWellKnown}

	for name, route := range map[string]kind{
		nameGarbage: kindGarbage,
		nameEmpty:   kindEmpty,
		nameGetIP:   kindGetIP,
	} {
		for _, prefix := range []string{"/", "/backend/"} {
			for _, suffix := range []string{"", ".php"} {
				paths[prefix+name+suffix] = route
			}
		}
	}

	return paths
}()

// allow is the Allow value of each route's row in compatibility.md section 5.
var allow = map[kind]string{
	kindGarbage:   "GET, OPTIONS",
	kindEmpty:     "GET, POST, OPTIONS",
	kindGetIP:     "GET, OPTIONS",
	kindWellKnown: "GET",
}

// Deps are what the layer is built from, created once at startup.
type Deps struct {
	// Config is the validated configuration: the download and upload caps, the allowed
	// origins of /getIP, and server.public_url, base_path and display_name of the server list.
	Config *config.Config
	// Buffer is the shared random buffer /garbage is cut from.
	Buffer *handlers.Buffer
	// Limit wraps /garbage and /empty in the per-client stream and request-rate limits; nil
	// leaves them unlimited.
	Limit func(http.Handler) http.Handler
	// Now is the clock an /empty body's lifetime starts from at handler entry; nil is
	// time.Now.
	Now func() time.Time
	// Download and Upload count the transfers under the layer's metrics group.
	Download metrics.Transfer
	Upload   metrics.Transfer
}

// Routes returns the layer's router, whose routes are the exact paths and methods of its
// route-table rows (compatibility.md section 5), to be mounted under server.base_path. The
// CORS step of section 2.2 runs before Limit; OPTIONS answers 200 and is never limited; a
// method a row does not list answers 405 with Allow and the error envelope.
func Routes(deps *Deps) *chi.Mux {
	limit := deps.Limit
	if limit == nil {
		limit = func(next http.Handler) http.Handler { return next }
	}

	now := deps.Now
	if now == nil {
		now = time.Now
	}

	cfg := deps.Config
	garbage := limit(Garbage(deps.Buffer, int64(cfg.Limits.MaxDownloadBytes), deps.Download))
	empty := limit(Empty(now, int64(cfg.Limits.MaxUploadBytes), deps.Upload))
	wellKnown := WellKnown(string(cfg.Server.PublicURL), cfg.Server.BasePath,
		cfg.Server.DisplayName)

	router := chi.NewRouter()
	router.Use(cors(cfg.Server.CORS.AllowedOrigins))
	router.NotFound(http.NotFound)
	router.MethodNotAllowed(methodNotAllowed)

	for path, route := range spellings {
		switch route {
		case kindGarbage:
			router.Method(http.MethodGet, path, garbage)
		case kindEmpty:
			router.Method(http.MethodGet, path, empty)
			router.Method(http.MethodPost, path, empty)
		case kindGetIP:
			router.MethodFunc(http.MethodGet, path, GetIP)
		case kindWellKnown:
			router.Method(http.MethodGet, path, wellKnown)

			continue
		case kindNone:
			continue
		}

		router.MethodFunc(http.MethodOptions, path, preflight)
	}

	return router
}

// routeOf is the route of the path the layer's router routes on.
func routeOf(request *http.Request) kind {
	path := request.URL.Path
	if routeContext := chi.RouteContext(request.Context()); routeContext != nil &&
		routeContext.RoutePath != "" {
		path = routeContext.RoutePath
	}

	return spellings[path]
}

// methodNotAllowed answers a method the path's row does not list.
func methodNotAllowed(writer http.ResponseWriter, request *http.Request) {
	if value := allow[routeOf(request)]; value != "" {
		writer.Header().Set("Allow", value)
	}

	handlers.WriteError(writer, http.StatusMethodNotAllowed, handlers.CodeMethodNotAllowed,
		"method not allowed", nil)
}

// preflight answers OPTIONS: the CORS step has set whatever headers the request gets.
func preflight(writer http.ResponseWriter, _ *http.Request) {
	answerEmpty(writer)
}

// zeroLength is the Content-Length of an empty 200.
var zeroLength = []string{"0"}

// answerEmpty answers 200 with an empty body: Content-Length 0, no Content-Type, no-store
// (compatibility.md section 6).
func answerEmpty(writer http.ResponseWriter) {
	header := writer.Header()
	header["Cache-Control"] = handlers.NoStore
	header["Content-Length"] = zeroLength

	writer.WriteHeader(http.StatusOK)
}

// queryValue is the first value of a query parameter, and whether the parameter is present.
func queryValue(request *http.Request, name string) (string, bool) {
	values, present := request.URL.Query()[name]
	if !present {
		return "", false
	}

	return values[0], true
}
