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

// Package metrics holds the Prometheus registry and the metric set of backend.md section 7. The
// instrumentation always runs; only the endpoint is gated by metrics.enabled. Every label child
// a request touches is resolved at startup, except a route's request counter for a status,
// which is created the first time the route answers it and kept from then on, so a request
// never formats a label value or looks one up in a metric vector after that.
package metrics

import (
	"runtime"
	"sync/atomic"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"

	"github.com/leinardi/bitgauge/internal/buildinfo"
)

const (
	namespace      = "bitgauge"
	labelGroup     = "group"
	labelDirection = "direction"
)

// durationBuckets reach the 120 s upload lifetime, so a slow link's throughput requests still
// fall in a bucket.
var durationBuckets = []float64{
	0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120,
}

// counterRef boxes a counter child so it can be published through an atomic pointer.
type counterRef struct {
	prometheus.Counter
}

// routeSeries are one route's series: its duration child, created at startup, and its request
// counter children by code slot, each created at the route's first answer with that status.
type routeSeries struct {
	requests *prometheus.CounterVec
	duration prometheus.Observer
	codes    [codeSlots]atomic.Pointer[counterRef]
	group    string
	route    string
}

func (s *routeSeries) observe(status int, seconds float64) {
	slot := codeSlot(status)

	counter := s.codes[slot].Load()
	if counter == nil {
		created := &counterRef{s.requests.WithLabelValues(s.group, s.route, codeLabels[slot])}
		if !s.codes[slot].CompareAndSwap(nil, created) {
			created = s.codes[slot].Load()
		}

		counter = created
	}

	counter.Inc()
	s.duration.Observe(seconds)
}

// routeKey finds a route's series.
type routeKey struct {
	group Group
	route string
}

// Transfer is the series of one group and direction. The zero value records nothing, which is
// what a nil *Metrics hands out.
type Transfer struct {
	bytes    prometheus.Counter
	active   prometheus.Gauge
	aborts   prometheus.Counter
	timeouts prometheus.Counter
}

// Start counts a transfer as in progress until Done.
func (t Transfer) Start() {
	if t.active != nil {
		t.active.Inc()
	}
}

// Done ends a transfer Start began.
func (t Transfer) Done() {
	if t.active != nil {
		t.active.Dec()
	}
}

// Add counts bytes sent or drained.
func (t Transfer) Add(bytes int) {
	if t.bytes != nil {
		t.bytes.Add(float64(bytes))
	}
}

// Abort counts a transfer the client abandoned before the body ended.
func (t Transfer) Abort() {
	if t.aborts != nil {
		t.aborts.Inc()
	}
}

// Timeout counts an upload body cut at its lifetime. A download transfer has no timeout series.
func (t Transfer) Timeout() {
	if t.timeouts != nil {
		t.timeouts.Inc()
	}
}

// Metrics is the registry and its series. A nil *Metrics records nothing.
type Metrics struct {
	registry      *prometheus.Registry
	routes        map[routeKey]*routeSeries
	transfers     map[Group]map[Direction]Transfer
	refused       map[Limit]prometheus.Counter
	wsConnections prometheus.Gauge
	wsMessages    prometheus.Counter
}

// New builds the registry with the Go runtime and process collectors and the metric set, its
// children created for routes, the routes the router mounts, plus the unmatched route of the
// spa and api groups. Transfer series exist for each group among routes that has throughput
// routes. tracked reports the entries in the rate-limit table at each scrape.
func New(build buildinfo.Build, tracked func() int, routes []Route) *Metrics {
	registry := prometheus.NewRegistry()
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	requests := prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "http_requests_total",
		Help:      "Requests by route group, route pattern and status.",
	}, []string{labelGroup, "route", "code"})
	durations := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Name:      "http_request_duration_seconds",
		Help:      "Request durations by route group and route pattern.",
		Buckets:   durationBuckets,
	}, []string{labelGroup, "route"})
	registry.MustRegister(requests, durations)

	all := append(
		[]Route{{Pattern: Unmatched, Group: GroupSPA}, {Pattern: Unmatched, Group: GroupAPI}},
		routes...)
	all = append(all, layerUnmatched(routes)...)
	metrics := &Metrics{
		registry:  registry,
		routes:    make(map[routeKey]*routeSeries, len(all)),
		transfers: map[Group]map[Direction]Transfer{},
		refused:   make(map[Limit]prometheus.Counter, len(sentinels)),
	}

	for _, route := range all {
		group := string(route.Group)
		metrics.routes[routeKey{route.Group, route.Pattern}] = &routeSeries{
			requests: requests,
			duration: durations.WithLabelValues(group, route.Pattern),
			group:    group,
			route:    route.Pattern,
		}
	}

	metrics.registerTransfers(all)
	metrics.registerLimits(tracked)
	metrics.registerWebSockets()

	info := prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "build_info",
		Help:      "Build information; always 1.",
		ConstLabels: prometheus.Labels{
			"version":   build.Version,
			"commit":    build.Commit,
			"goversion": runtime.Version(),
		},
	})
	info.Set(1)
	registry.MustRegister(info)

	return metrics
}

// Observe records a finished request of route, a pattern New was given or Unmatched, with
// the status it answered, 0 when it ended without a response, and its duration.
func (m *Metrics) Observe(group Group, route string, status int, seconds float64) {
	if m == nil {
		return
	}

	series, found := m.routes[routeKey{group, route}]
	if !found {
		// The router mounts only the routes New was given; anything else is unmatched.
		series, found = m.routes[routeKey{group, Unmatched}]
		if !found {
			return
		}
	}

	series.observe(status, seconds)
}

// Transfer is the transfer series of group and direction; the zero Transfer, which records
// nothing, for a group without throughput routes or a nil *Metrics.
func (m *Metrics) Transfer(group Group, direction Direction) Transfer {
	if m == nil {
		return Transfer{}
	}

	return m.transfers[group][direction]
}

// Refused counts a refused acquisition by its limit; an error that is not one of the ratelimit
// sentinels counts nothing.
func (m *Metrics) Refused(err error) {
	if m == nil {
		return
	}

	if limit, isLimit := limitOf(err); isLimit {
		m.refused[limit].Inc()
	}
}

// WebSocketOpened counts an open latency WebSocket until WebSocketClosed.
func (m *Metrics) WebSocketOpened() {
	if m != nil {
		m.wsConnections.Inc()
	}
}

// WebSocketClosed ends a connection WebSocketOpened counted.
func (m *Metrics) WebSocketClosed() {
	if m != nil {
		m.wsConnections.Dec()
	}
}

// WebSocketEchoed counts an echoed ping.
func (m *Metrics) WebSocketEchoed() {
	if m != nil {
		m.wsMessages.Inc()
	}
}

func (m *Metrics) registerTransfers(routes []Route) {
	bytes := prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "transfer_bytes_total",
		Help:      "Bytes sent (download) and drained (upload).",
	}, []string{labelGroup, labelDirection})
	active := prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "active_transfers",
		Help:      "Transfers in progress.",
	}, []string{labelGroup, labelDirection})
	aborts := prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "http_aborts_total",
		Help:      "Transfers the client abandoned before the body ended.",
	}, []string{labelGroup, labelDirection})
	timeouts := prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "upload_timeouts_total",
		Help:      "Upload bodies cut at the 120 s lifetime.",
	}, []string{labelGroup})
	m.registry.MustRegister(bytes, active, aborts, timeouts)

	for _, route := range routes {
		group := route.Group
		if !group.carriesTransfers() || m.transfers[group] != nil {
			continue
		}

		m.transfers[group] = make(map[Direction]Transfer, len(directions))

		for _, direction := range directions {
			transfer := Transfer{
				bytes:  bytes.WithLabelValues(string(group), string(direction)),
				active: active.WithLabelValues(string(group), string(direction)),
				aborts: aborts.WithLabelValues(string(group), string(direction)),
			}
			if direction == Upload {
				transfer.timeouts = timeouts.WithLabelValues(string(group))
			}

			m.transfers[group][direction] = transfer
		}
	}
}

func (m *Metrics) registerLimits(tracked func() int) {
	refused := prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "rate_limited_total",
		Help:      "Rejections by limit.",
	}, []string{"limit"})
	m.registry.MustRegister(refused, prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "ratelimit_tracked_clients",
		Help:      "Entries in the rate-limit table.",
	}, func() float64 {
		if tracked == nil {
			return 0
		}

		return float64(tracked())
	}))

	for _, sentinel := range sentinels {
		m.refused[sentinel.limit] = refused.WithLabelValues(string(sentinel.limit))
	}
}

func (m *Metrics) registerWebSockets() {
	m.wsConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Name:      "websocket_connections",
		Help:      "Open latency WebSockets.",
	})
	m.wsMessages = prometheus.NewCounter(prometheus.CounterOpts{
		Namespace: namespace,
		Name:      "websocket_messages_total",
		Help:      "Echoed ping messages.",
	})
	m.registry.MustRegister(m.wsConnections, m.wsMessages)
}

// layerUnmatched is the Unmatched route of each compatibility layer that has a mounted route:
// a request the security-header classifier puts in an enabled layer's group without a route
// matching it, such as a method its route-table row does not list, counts there
// (backend.md section 7).
func layerUnmatched(routes []Route) []Route {
	var unmatched []Route

	for _, layer := range [...]Group{GroupOpenSpeedTest, GroupLibreSpeed, GroupNQ} {
		for _, route := range routes {
			if route.Group == layer {
				unmatched = append(unmatched, Route{Pattern: Unmatched, Group: layer})

				break
			}
		}
	}

	return unmatched
}
