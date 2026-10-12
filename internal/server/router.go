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

package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// Route is one row of the route table of compatibility.md section 5: a path pattern, in chi's
// syntax, under base_path.
type Route struct {
	Pattern string
	Owner   string
	Methods []string
}

const (
	ownerSPA           = "SPA"
	ownerNative        = "native"
	ownerOperations    = "operations"
	ownerOpenSpeedTest = "OpenSpeedTest"
	ownerLibreSpeed    = "LibreSpeed"
	ownerNQ            = "networkQuality"
)

// spaRoutes are the SPA's fixed routes (architecture.md section 1), all GET.
var spaRoutes = []string{"/", "/result/{id}", "/history", "/settings", "/about", "/assets/*"}

// RouteTable is every route BitGauge can serve, whether or not its group is enabled, except
// /metrics, whose path is the thing checked against it. It is the list the metrics.path
// collision check reads (configuration-security.md section 2).
func RouteTable() []Route {
	// The native API's six routes, OpenSpeedTest's two, LibreSpeed's thirteen and
	// networkQuality's five.
	const otherRoutes = 6 + 2 + 13 + 5

	get := []string{http.MethodGet}
	table := make([]Route, 0, len(spaRoutes)+otherRoutes)

	for _, pattern := range spaRoutes {
		table = append(table, Route{Pattern: pattern, Owner: ownerSPA, Methods: get})
	}

	table = append(table,
		Route{handlers.Prefix + "/download", ownerNative, get},
		Route{handlers.Prefix + "/upload", ownerNative, []string{http.MethodPost}},
		Route{handlers.Prefix + "/ping", ownerNative, []string{http.MethodGet, http.MethodHead}},
		Route{handlers.Prefix + "/small", ownerNative, get},
		Route{handlers.Prefix + "/ws", ownerNative, get},
		Route{handlers.Prefix + "/info", ownerNative, get},
		Route{
			"/downloading", ownerOpenSpeedTest,
			[]string{http.MethodGet, http.MethodHead, http.MethodOptions},
		},
		Route{
			"/upload", ownerOpenSpeedTest,
			[]string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodOptions},
		},
	)

	for _, prefix := range []string{"", "/backend"} {
		for _, suffix := range []string{"", ".php"} {
			table = append(table,
				Route{
					prefix + "/garbage" + suffix, ownerLibreSpeed,
					[]string{http.MethodGet, http.MethodOptions},
				},
				Route{
					prefix + "/empty" + suffix, ownerLibreSpeed,
					[]string{http.MethodGet, http.MethodPost, http.MethodOptions},
				},
				Route{
					prefix + "/getIP" + suffix, ownerLibreSpeed,
					[]string{http.MethodGet, http.MethodOptions},
				},
			)
		}
	}

	return append(table,
		Route{"/.well-known/librespeed", ownerLibreSpeed, get},
		Route{"/nq/config", ownerNQ, get},
		Route{"/.well-known/nq", ownerNQ, get},
		Route{"/nq/small", ownerNQ, get},
		Route{"/nq/large", ownerNQ, get},
		Route{"/nq/upload", ownerNQ, []string{http.MethodPost}},
	)
}

// CheckRoutes is the metrics.path rule of configuration.md section 4 that config.Validate
// leaves to the router: the path must not collide with any row of the route table, nor fall
// under the native API, whose unknown paths answer its own 404.
func CheckRoutes(cfg *config.Config) []config.Problem {
	path := cfg.Metrics.Path

	if path == handlers.Prefix || strings.HasPrefix(path, handlers.Prefix+"/") {
		return []config.Problem{{
			Key:   "metrics.path",
			Value: path,
			Rule:  "must not be under " + handlers.Prefix + ", the native API",
		}}
	}

	for _, route := range RouteTable() {
		if matches(route.Pattern, path) {
			return []config.Problem{
				{
					Key:   "metrics.path",
					Value: path,
					Rule: fmt.Sprintf(
						"must not collide with the %s route %s (compatibility.md section 5)",
						route.Owner,
						route.Pattern,
					),
				},
			}
		}
	}

	return nil
}

// matches reports whether path is matched by a chi pattern of the route table: a literal, a
// {param} segment, or a trailing /* that matches anything below its prefix.
func matches(pattern, path string) bool {
	if prefix, wildcard := strings.CutSuffix(pattern, "*"); wildcard {
		return strings.HasPrefix(path, prefix)
	}

	patternSegments := strings.Split(pattern, "/")
	pathSegments := strings.Split(path, "/")

	if len(patternSegments) != len(pathSegments) {
		return false
	}

	for index, segment := range patternSegments {
		isParam := strings.HasPrefix(segment, "{") && strings.HasSuffix(segment, "}")
		if isParam && pathSegments[index] == "" {
			return false
		}

		if !isParam && segment != pathSegments[index] {
			return false
		}
	}

	return true
}

// Groups are the route groups the router mounts (backend.md section 4).
type Groups struct {
	// SPA serves the SPA's fixed routes; until the SPA ships it is nil, and they answer 404.
	SPA http.Handler
	// Native builds the native API.
	Native *handlers.Deps
	// Limiter limits the native throughput routes.
	Limiter *ratelimit.Limiter
	Log     *slog.Logger
}

// NewRouter mounts the route groups under base_path: the SPA's fixed routes, then the native
// API at /api/v1 behind its CORS step, with the limiter on download and upload only. The
// compatibility layers and /metrics join with the releases that ship them. Unknown paths under
// /api/v1 get the error envelope; any other unknown path a plain 404.
//
// The route collision check runs first, so no router exists for a configuration that fails
// it: a non-empty problem list comes with a nil router, and the caller reports it and exits
// with status 2 like any other configuration problem.
func NewRouter(cfg *config.Config, groups *Groups) (*chi.Mux, []config.Problem) {
	problems := CheckRoutes(cfg)
	if len(problems) > 0 {
		return nil, problems
	}

	native := *groups.Native
	native.Limit = ratelimit.Middleware(groups.Limiter, handlers.ErrorWriter{}, groups.Log)

	mount := func(base chi.Router) {
		if groups.SPA != nil {
			for _, pattern := range spaRoutes {
				base.Method(http.MethodGet, pattern, groups.SPA)
			}
		}

		base.Group(func(api chi.Router) {
			api.Use(nativeCORS(cfg.Server.CORS.AllowedOrigins))
			api.Mount(handlers.Prefix, handlers.Routes(&native))
		})
	}

	root := chi.NewRouter()
	root.NotFound(http.NotFound)

	base := strings.TrimSuffix(cfg.Server.BasePath, "/")
	if base == "" {
		mount(root)
	} else {
		root.Route(base, mount)
	}

	return root, nil
}
