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
	"context"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/compat/librespeed"
	"github.com/leinardi/bitgauge/internal/compat/openspeedtest"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
	"github.com/leinardi/bitgauge/web"
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

// groupOf is the metrics' group label of each owner of the route table (backend.md section 7).
var groupOf = map[string]metrics.Group{
	ownerSPA:           metrics.GroupSPA,
	ownerNative:        metrics.GroupAPI,
	ownerOperations:    metrics.GroupMetrics,
	ownerOpenSpeedTest: metrics.GroupOpenSpeedTest,
	ownerLibreSpeed:    metrics.GroupLibreSpeed,
	ownerNQ:            metrics.GroupNQ,
}

// spaRoutes are the SPA's fixed routes, its hashed assets and its root assets (architecture.md
// section 3), all GET, as package web registers them.
func spaRoutes() []string {
	routes := make([]string, 0, len(web.DocumentRoutes)+1+len(web.RootAssets))
	routes = append(routes, web.DocumentRoutes...)
	routes = append(routes, web.AssetRoutes)

	for _, name := range slices.Sorted(maps.Keys(web.RootAssets)) {
		routes = append(routes, "/"+name)
	}

	return routes
}

// RouteTable is every route BitGauge can serve, whether or not its group is enabled, except
// /metrics, whose path is the thing checked against it. It is the list the metrics.path
// collision check reads (configuration-security.md section 2).
func RouteTable() []Route {
	// The native API's six routes, OpenSpeedTest's two, LibreSpeed's thirteen and
	// networkQuality's five.
	const otherRoutes = 6 + 2 + 13 + 5

	get := []string{http.MethodGet}
	spa := spaRoutes()
	table := make([]Route, 0, len(spa)+otherRoutes)

	for _, pattern := range spa {
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

// ownerMounted reports whether NewRouter mounts owner's rows of the route table for cfg: the
// SPA's and the native API's always, a compatibility layer's when its toggle is on. The
// networkQuality layer joins with the commit that ships it.
func ownerMounted(cfg *config.Config, owner string) bool {
	switch owner {
	case ownerSPA, ownerNative:
		return true
	case ownerOpenSpeedTest:
		return cfg.Compat.OpenSpeedTest.Enabled
	case ownerLibreSpeed:
		return cfg.Compat.LibreSpeed.Enabled
	}

	return false
}

// layerGroups are the security-header groups of the compatibility layers' owners.
var layerGroups = map[string]Group{
	ownerOpenSpeedTest: GroupOpenSpeedTest,
	ownerLibreSpeed:    GroupLibreSpeed,
	ownerNQ:            GroupNQ,
}

// LayerPaths are the exact route paths of every compatibility layer NewRouter mounts for cfg,
// without base_path, by the layer's group: what NewClassifier takes.
func LayerPaths(cfg *config.Config) map[Group][]string {
	paths := map[Group][]string{}

	for _, route := range RouteTable() {
		if group, isLayer := layerGroups[route.Owner]; isLayer && ownerMounted(cfg, route.Owner) {
			paths[group] = append(paths[group], route.Pattern)
		}
	}

	return paths
}

// MountedRoutes are the routes NewRouter mounts for cfg, without base_path, each with the
// metrics' group of its owner: the SPA's, the native API's, each enabled compatibility layer's,
// and metrics.path when metrics.enabled is set.
func MountedRoutes(cfg *config.Config) []metrics.Route {
	table := RouteTable()
	routes := make([]metrics.Route, 0, len(table)+1)

	for _, route := range table {
		if ownerMounted(cfg, route.Owner) {
			routes = append(
				routes,
				metrics.Route{Pattern: route.Pattern, Group: groupOf[route.Owner]},
			)
		}
	}

	if cfg.Metrics.Enabled {
		routes = append(routes, metrics.Route{
			Pattern: cfg.Metrics.Path,
			Group:   groupOf[ownerOperations],
		})
	}

	return routes
}

// Groups are the route groups the router mounts (backend.md section 4).
type Groups struct {
	// SPA registers the SPA's routes (web.SPA.Routes); without it they answer 404.
	SPA func(chi.Router)
	// Native builds the native API.
	Native *handlers.Deps
	// OpenSpeedTest builds the OpenSpeedTest layer, mounted when compat.openspeedtest.enabled
	// is set; NewRouter adds its limiter.
	OpenSpeedTest *openspeedtest.Deps
	// LibreSpeed builds the LibreSpeed layer, mounted when compat.librespeed.enabled is set;
	// NewRouter adds its limiter.
	LibreSpeed *librespeed.Deps
	// Limiter limits the native throughput routes and the compatibility layers'.
	Limiter *ratelimit.Limiter
	// Metrics serves the metrics endpoint (metrics.Metrics.Handler), mounted when
	// metrics.enabled is set; without it the path answers 404. Native.Metrics, not this,
	// counts the limiter's refusals.
	Metrics http.Handler
	Log     *slog.Logger
}

// NewRouter mounts the route groups under base_path: the SPA's fixed routes, the native API at
// /api/v1 behind its CORS step, with the limiter on download and upload only, each enabled
// compatibility layer at its exact paths for the methods of its route-table rows, and the
// metrics endpoint at metrics.path when metrics.enabled is set, for GET only and outside any
// limit. Unknown paths under /api/v1 get the error envelope; any other unknown path a plain
// 404. A method a layer's row does not list reaches that layer, which answers 405 itself.
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
	native.Limit = ratelimit.Middleware(groups.Limiter, handlers.ErrorWriter{}, groups.Log,
		native.Metrics)

	layers := layerHandlers(cfg, groups, native.Limit)

	mount := func(base chi.Router) {
		if groups.SPA != nil {
			groups.SPA(base)
		}

		for _, route := range RouteTable() {
			if handler, mounted := layers[route.Pattern]; mounted {
				for _, method := range route.Methods {
					base.Method(method, route.Pattern, handler)
				}
			}
		}

		if cfg.Metrics.Enabled && groups.Metrics != nil {
			base.Handle(cfg.Metrics.Path, getOnly(groups.Metrics))
		}

		base.Group(func(api chi.Router) {
			api.Use(nativeCORS(cfg.Server.CORS.AllowedOrigins))
			api.Mount(handlers.Prefix, handlers.Routes(&native))
		})
	}

	root := chi.NewRouter()
	root.NotFound(http.NotFound)

	base := strings.TrimSuffix(cfg.Server.BasePath, "/")
	// Set before the base path's sub-router exists, which inherits it.
	root.MethodNotAllowed(methodNotAllowed(root, base, layers))

	if base == "" {
		mount(root)
	} else {
		root.Route(base, mount)
	}

	return root, nil
}

// layerHandlers are the entries into every enabled compatibility layer's router, by exact
// path without base_path, the layer limited by limit.
func layerHandlers(
	cfg *config.Config,
	groups *Groups,
	limit func(http.Handler) http.Handler,
) map[string]http.Handler {
	routers := map[string]http.Handler{}

	if ownerMounted(cfg, ownerOpenSpeedTest) {
		deps := *groups.OpenSpeedTest
		deps.Limit = limit
		routers[ownerOpenSpeedTest] = openspeedtest.Routes(&deps)
	}

	if ownerMounted(cfg, ownerLibreSpeed) {
		deps := *groups.LibreSpeed
		deps.Limit = limit
		routers[ownerLibreSpeed] = librespeed.Routes(&deps)
	}

	entries := map[string]http.Handler{}

	for _, route := range RouteTable() {
		if layer, mounted := routers[route.Owner]; mounted {
			entries[route.Pattern] = enter(layer, route.Pattern)
		}
	}

	return entries
}

// enter hands a request to a layer's router at its route-table path, below base_path, with a
// route context of the layer's own: the layer routes on that path, and the request keeps the
// pattern the outer router matched, which the metrics label it with.
func enter(layer http.Handler, path string) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		routeContext := chi.NewRouteContext()
		routeContext.RoutePath = path

		layer.ServeHTTP(writer, request.WithContext(
			context.WithValue(request.Context(), chi.RouteCtxKey, routeContext)))
	})
}

// probedMethods are the methods methodNotAllowed probes the router for.
var probedMethods = [...]string{
	http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch,
	http.MethodDelete, http.MethodConnect, http.MethodOptions, http.MethodTrace,
}

// methodNotAllowed answers a method no route of a known path lists. On a compatibility
// layer's path the layer answers, with its own 405 (compatibility.md section 6); anywhere
// else the answer is chi's own: 405, an Allow value for each method the path does serve, and
// no body. chi passes a custom handler no method list, so the router is probed for it.
func methodNotAllowed(
	router *chi.Mux,
	base string,
	layers map[string]http.Handler,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if trimmed, below := strings.CutPrefix(request.URL.Path, base); below {
			if layer, isLayer := layers[trimmed]; isLayer {
				layer.ServeHTTP(writer, request)

				return
			}
		}

		for _, method := range probedMethods {
			if router.Match(chi.NewRouteContext(), method, request.URL.Path) {
				writer.Header().Add("Allow", method)
			}
		}

		writer.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// getOnly answers any method but GET with a plain 405 and Allow: GET (backend.md section 7).
func getOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.Header().Set("Allow", http.MethodGet)
			http.Error(writer, http.StatusText(http.StatusMethodNotAllowed),
				http.StatusMethodNotAllowed)

			return
		}

		next.ServeHTTP(writer, request)
	})
}
