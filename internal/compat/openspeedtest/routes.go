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

// Package openspeedtest is the OpenSpeedTest compatibility layer (compatibility.md section 1):
// the two routes a self-hosted copy of the OpenSpeedTest web UI drives, translated onto the
// native building blocks of package handlers. It is mounted only when
// compat.openspeedtest.enabled is set.
package openspeedtest

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

const (
	// DownloadPath sends the fixed-size random body.
	DownloadPath = "/downloading"
	// UploadPath is the ping on GET and HEAD, and the upload on POST.
	UploadPath = "/upload"
)

// Deps are what the layer is built from, created once at startup.
type Deps struct {
	// Buffer is the shared random buffer the download is cut from.
	Buffer *handlers.Buffer
	// Limit wraps every route but the preflight in the per-client stream and request-rate
	// limits; nil leaves them unlimited.
	Limit func(http.Handler) http.Handler
	// Now is the clock an upload's lifetime starts from at handler entry; nil is time.Now.
	Now func() time.Time
	// Download and Upload count the transfers under the layer's metrics group.
	Download metrics.Transfer
	Upload   metrics.Transfer
}

// allow is the Allow value of each path's route-table row (compatibility.md section 5).
var allow = map[string]string{
	DownloadPath: "GET, HEAD, OPTIONS",
	UploadPath:   "GET, HEAD, POST, OPTIONS",
}

// Routes returns the layer's router, whose routes are the exact paths and methods of its
// route-table rows (compatibility.md section 5), to be mounted under server.base_path. Every
// response carries the CORS headers, which are set before Limit (section 1.2); OPTIONS answers
// 200 and is never limited; a method a row does not list answers 405 with Allow and the error
// envelope.
func Routes(deps *Deps) *chi.Mux {
	limit := deps.Limit
	if limit == nil {
		limit = func(next http.Handler) http.Handler { return next }
	}

	now := deps.Now
	if now == nil {
		now = time.Now
	}

	download := limit(Download(deps.Buffer, deps.Download))
	ping := limit(http.HandlerFunc(Ping))

	router := chi.NewRouter()
	router.Use(cors)
	router.NotFound(http.NotFound)
	router.MethodNotAllowed(methodNotAllowed)

	router.Method(http.MethodGet, DownloadPath, download)
	router.Method(http.MethodHead, DownloadPath, download)
	router.Method(http.MethodGet, UploadPath, ping)
	router.Method(http.MethodHead, UploadPath, ping)
	router.Method(http.MethodPost, UploadPath, limit(Upload(now, deps.Upload)))

	for path := range allow {
		router.MethodFunc(http.MethodOptions, path, preflight)
	}

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

// preflight answers OPTIONS on either path: the CORS headers are set by then.
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
