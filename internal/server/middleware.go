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
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// unmatchedRoute is logged for a request no route matched.
const unmatchedRoute = "unmatched"

// Classifier tells which header set and error format a request gets.
type Classifier func(request *http.Request) Group

// recorder wraps the response writer for the request log and the panic recovery: it notes
// the status, the body bytes and whether the response has started. Unwrap keeps the
// underlying writer reachable for http.ResponseController and the WebSocket hijack.
type recorder struct {
	http.ResponseWriter

	status  int
	bytes   int64
	started bool
}

func (r *recorder) WriteHeader(status int) {
	// An informational status other than 101 does not start the response.
	informational := status < http.StatusOK && status != http.StatusSwitchingProtocols
	if !r.started && !informational {
		r.status, r.started = status, true
	}

	r.ResponseWriter.WriteHeader(status)
}

func (r *recorder) Write(data []byte) (int, error) {
	if !r.started {
		r.status, r.started = http.StatusOK, true
	}

	written, err := r.ResponseWriter.Write(data)
	r.bytes += int64(written)

	if err != nil {
		return written, fmt.Errorf("write the response: %w", err)
	}

	return written, nil
}

func (r *recorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

// stage is one global middleware, named for the tests that check the order.
type stage struct {
	wrap func(http.Handler) http.Handler
	name string
}

// stages are the global middleware of backend.md section 3, outermost first: panic recovery,
// client IP, security headers, then the request log and metrics. routes is the router when it
// is a chi router, so that the route context recovery creates is complete.
func stages(
	routes chi.Routes,
	deriver *clientip.Deriver,
	classify Classifier,
	clock ratelimit.Clock,
	log *slog.Logger,
	observer *Observer,
) []stage {
	return []stage{
		{name: "recovery", wrap: func(next http.Handler) http.Handler {
			return recovery(next, routes, classify, log)
		}},
		{name: "client-ip", wrap: clientip.Middleware(deriver)},
		{name: "headers", wrap: func(next http.Handler) http.Handler {
			return securityHeaders(next, classify)
		}},
		{name: "observe", wrap: func(next http.Handler) http.Handler {
			return observe(next, observer, classify, clock, log)
		}},
	}
}

// compose wraps next in the stages, the first one outermost.
func compose(next http.Handler, chain []stage) http.Handler {
	for _, c := range slices.Backward(chain) {
		next = c.wrap(next)
	}

	return next
}

// Chain wraps next, the router, in the global middleware of backend.md section 3. Recovery
// gives the request a chi route context up front, so that it and the observe stage can read the
// route pattern the router fills in; when next is a chi router the context also carries it as
// Routes, as chi would have set it. observer records the requests in the metrics; nil records
// nothing.
func Chain(
	next http.Handler,
	deriver *clientip.Deriver,
	classify Classifier,
	clock ratelimit.Clock,
	log *slog.Logger,
	observer *Observer,
) http.Handler {
	routes, _ := next.(chi.Routes)

	return compose(next, stages(routes, deriver, classify, clock, log, observer))
}

// recovery answers a panic with 500, as the error envelope on every group but the SPA's (the
// native API, /metrics and the enabled compatibility layers), and logs it at
// warn with the route pattern and the panic's type, never its value, which could quote the
// request. http.ErrAbortHandler passes through: it is how a handler asks net/http to drop the
// connection. A panic after the response has started cannot be answered, so the connection
// is dropped the same way.
func recovery(
	next http.Handler,
	routes chi.Routes,
	classify Classifier,
	log *slog.Logger,
) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		routeContext := chi.NewRouteContext()
		routeContext.Routes = routes
		request = request.WithContext(
			context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
		wrapped := &recorder{ResponseWriter: writer}

		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}

			err, isError := recovered.(error)
			if isError && errors.Is(err, http.ErrAbortHandler) {
				panic(recovered)
			}

			log.Warn("panic recovered",
				slog.String("route", routePattern(routeContext)),
				slog.String("panic", fmt.Sprintf("%T", recovered)))

			if wrapped.started {
				panic(http.ErrAbortHandler)
			}

			if classify(request) != GroupSPA {
				handlers.WriteError(wrapped, http.StatusInternalServerError, handlers.CodeInternal,
					"internal server error", nil)

				return
			}

			// Whatever caching the handler had set does not apply to this answer.
			wrapped.Header()["Cache-Control"] = valueNoStore
			http.Error(wrapped, http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError)
		}()

		next.ServeHTTP(wrapped, request)
	})
}

// securityHeaders sets the header set of the request's group before anything is written.
func securityHeaders(next http.Handler, classify Classifier) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		setHeaders(writer.Header(), classify(request), request.Host)
		next.ServeHTTP(writer, request)
	})
}

// Observer records each finished request in the metrics, labeled with the owner and the
// pattern of the route it matched (backend.md section 7). A nil *Observer records nothing.
type Observer struct {
	meter  *metrics.Metrics
	groups map[string]metrics.Group
	base   string
}

// NewObserver resolves the labels of the routes the router mounts for cfg (MountedRoutes) once,
// so a request only looks its route up.
func NewObserver(cfg *config.Config, meter *metrics.Metrics) *Observer {
	routes := MountedRoutes(cfg)
	groups := make(map[string]metrics.Group, len(routes))

	for _, route := range routes {
		groups[route.Pattern] = route.Group
	}

	return &Observer{
		meter:  meter,
		groups: groups,
		base:   strings.TrimSuffix(cfg.Server.BasePath, "/"),
	}
}

// labels are the group and route labels of a finished request: its route's owner and pattern
// without base_path, or, when no route matched, the security-header classifier's group and
// Unmatched.
func (o *Observer) labels(
	request *http.Request,
	classify Classifier,
) (group metrics.Group, route string) {
	pattern := routePattern(chi.RouteContext(request.Context()))
	if trimmed, below := strings.CutPrefix(pattern, o.base); below {
		if trimmed == "" {
			trimmed = "/"
		}

		if owner, mounted := o.groups[trimmed]; mounted {
			return owner, trimmed
		}
	}

	return classify(request).metricsGroup(), metrics.Unmatched
}

func (o *Observer) record(
	request *http.Request,
	classify Classifier,
	status int,
	elapsed time.Duration,
) {
	if o == nil {
		return
	}

	group, route := o.labels(request, classify)
	o.meter.Observe(group, route, status, elapsed.Seconds())
}

// observe is the logging and metrics stage. Every request is recorded in the metrics, a
// panicking one included: with the status it had started, else 500, which recovery answers,
// else, for http.ErrAbortHandler, no status at all. One line per request is logged at debug,
// and only at debug: method, route pattern, status, body bytes, duration and the derived
// client IP. Never a header, a query string or a body (configuration-security.md section 6).
func observe(
	next http.Handler,
	observer *Observer,
	classify Classifier,
	clock ratelimit.Clock,
	log *slog.Logger,
) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := clock.Now()
		wrapped, isRecorder := writer.(*recorder)

		if !isRecorder {
			wrapped = &recorder{ResponseWriter: writer}
		}

		defer func(ctx context.Context) {
			recovered := recover()
			status := finalStatus(wrapped, recovered)
			elapsed := clock.Now().Sub(start)

			observer.record(request, classify, status, elapsed)

			if recovered != nil {
				panic(recovered)
			}

			if !log.Enabled(ctx, slog.LevelDebug) {
				return
			}

			addr, _ := clientip.FromContext(ctx)
			log.LogAttrs(ctx, slog.LevelDebug, "request",
				slog.String("method", request.Method),
				slog.String("route", routePattern(chi.RouteContext(ctx))),
				slog.Int("status", status),
				slog.Int64("bytes", wrapped.bytes),
				slog.Duration("duration", elapsed),
				slog.String("client", addr.String()))
		}(request.Context())

		next.ServeHTTP(wrapped, request)
	})
}

// finalStatus is the status a request ended with: the one its response started with; net/http's
// implicit 200 for a handler that wrote nothing; for a panic, the 500 recovery answers, or 0,
// no response, for http.ErrAbortHandler, on which the connection is dropped.
func finalStatus(wrapped *recorder, recovered any) int {
	switch {
	case wrapped.started:
		return wrapped.status
	case recovered == nil:
		return http.StatusOK
	}

	err, isError := recovered.(error)
	if isError && errors.Is(err, http.ErrAbortHandler) {
		return 0
	}

	return http.StatusInternalServerError
}

func routePattern(routeContext *chi.Context) string {
	if routeContext == nil {
		return unmatchedRoute
	}

	if pattern := routeContext.RoutePattern(); pattern != "" {
		return pattern
	}

	return unmatchedRoute
}
