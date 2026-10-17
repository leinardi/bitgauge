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

package metrics

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

var (
	errOther   = errors.New("not a limit")
	errGather  = errors.New("gather failed")
	testBuild  = buildinfo.Build{Version: "0.2.0", Commit: "a1b2c3d", Date: "2026-10-17T12:00:00Z"}
	testRoutes = []Route{
		{Pattern: "/", Group: GroupSPA},
		{Pattern: "/api/v1/download", Group: GroupAPI},
		{Pattern: "/metrics", Group: GroupMetrics},
	}
)

func newTestMetrics(tracked int) *Metrics {
	return New(testBuild, func() int { return tracked }, testRoutes)
}

func compare(t *testing.T, meter *Metrics, expected string, names ...string) {
	t.Helper()

	err := testutil.GatherAndCompare(meter.registry, strings.NewReader(expected), names...)
	if err != nil {
		t.Fatal(err)
	}
}

// TestMetricSet pins the names, types, help-independent labels and startup children of the
// metric set of backend.md section 7.
func TestMetricSet(t *testing.T) {
	t.Parallel()

	meter := newTestMetrics(3)

	download := meter.Transfer(GroupAPI, Download)
	download.Start()
	download.Add(1000)
	download.Abort()

	upload := meter.Transfer(GroupAPI, Upload)
	upload.Start()
	upload.Add(250)
	upload.Done()
	upload.Timeout()

	meter.Refused(fmt.Errorf("refused: %w", ratelimit.ErrRate))
	meter.WebSocketOpened()
	meter.WebSocketEchoed()
	meter.WebSocketEchoed()

	compare(t, meter, `
# HELP bitgauge_transfer_bytes_total Bytes sent (download) and drained (upload).
# TYPE bitgauge_transfer_bytes_total counter
bitgauge_transfer_bytes_total{direction="download",group="api"} 1000
bitgauge_transfer_bytes_total{direction="upload",group="api"} 250
# HELP bitgauge_active_transfers Transfers in progress.
# TYPE bitgauge_active_transfers gauge
bitgauge_active_transfers{direction="download",group="api"} 1
bitgauge_active_transfers{direction="upload",group="api"} 0
# HELP bitgauge_http_aborts_total Transfers the client abandoned before the body ended.
# TYPE bitgauge_http_aborts_total counter
bitgauge_http_aborts_total{direction="download",group="api"} 1
bitgauge_http_aborts_total{direction="upload",group="api"} 0
# HELP bitgauge_upload_timeouts_total Upload bodies cut at the 120 s lifetime.
# TYPE bitgauge_upload_timeouts_total counter
bitgauge_upload_timeouts_total{group="api"} 1
# HELP bitgauge_rate_limited_total Rejections by limit.
# TYPE bitgauge_rate_limited_total counter
bitgauge_rate_limited_total{limit="nq_flows"} 0
bitgauge_rate_limited_total{limit="rate"} 1
bitgauge_rate_limited_total{limit="streams"} 0
bitgauge_rate_limited_total{limit="table_full"} 0
bitgauge_rate_limited_total{limit="websocket"} 0
# HELP bitgauge_websocket_connections Open latency WebSockets.
# TYPE bitgauge_websocket_connections gauge
bitgauge_websocket_connections 1
# HELP bitgauge_websocket_messages_total Echoed ping messages.
# TYPE bitgauge_websocket_messages_total counter
bitgauge_websocket_messages_total 2
# HELP bitgauge_ratelimit_tracked_clients Entries in the rate-limit table.
# TYPE bitgauge_ratelimit_tracked_clients gauge
bitgauge_ratelimit_tracked_clients 3
# HELP bitgauge_build_info Build information; always 1.
# TYPE bitgauge_build_info gauge
bitgauge_build_info{commit="a1b2c3d",goversion="`+runtime.Version()+`",version="0.2.0"} 1
`,
		"bitgauge_transfer_bytes_total",
		"bitgauge_active_transfers",
		"bitgauge_http_aborts_total",
		"bitgauge_upload_timeouts_total",
		"bitgauge_rate_limited_total",
		"bitgauge_websocket_connections",
		"bitgauge_websocket_messages_total",
		"bitgauge_ratelimit_tracked_clients",
		"bitgauge_build_info",
	)
}

// bucketBounds are backend.md section 7's upper bounds, as the exposition writes them.
var bucketBounds = [...]string{
	"0.005", "0.01", "0.025", "0.05", "0.1", "0.25", "0.5", "1", "2.5", "5", "10", "30", "60",
	"120", "+Inf",
}

// histogram is the expected exposition of one duration child: firstFull is the index of the
// first bucket counting its count observations, summing to sum.
func histogram(group, route string, firstFull, count int, sum float64) string {
	var text strings.Builder

	for index, le := range bucketBounds {
		inBucket := 0
		if index >= firstFull {
			inBucket = count
		}

		fmt.Fprintf(&text,
			"bitgauge_http_request_duration_seconds_bucket{group=%q,le=%q,route=%q} %d\n",
			group, le, route, inBucket)
	}

	fmt.Fprintf(&text, "bitgauge_http_request_duration_seconds_sum{group=%q,route=%q} %g\n",
		group, route, sum)
	fmt.Fprintf(&text, "bitgauge_http_request_duration_seconds_count{group=%q,route=%q} %d\n",
		group, route, count)

	return text.String()
}

func TestRequestSeries(t *testing.T) {
	t.Parallel()

	meter := New(testBuild, nil, []Route{{Pattern: "/api/v1/download", Group: GroupAPI}})

	// No request counter exists before a route answers, while every duration child does.
	compare(t, meter, "", "bitgauge_http_requests_total")

	const (
		bucket7s   = 10 // the 10 s bucket
		bucket2ms  = 0  // the 5 ms bucket
		bucket20ms = 2  // the 25 ms bucket
		untouched  = len(bucketBounds)
	)

	compare(t, meter, `
# HELP bitgauge_http_request_duration_seconds Request durations by route group and route pattern.
# TYPE bitgauge_http_request_duration_seconds histogram
`+histogram("api", "/api/v1/download", untouched, 0, 0)+
		histogram("api", Unmatched, untouched, 0, 0)+
		histogram("spa", Unmatched, untouched, 0, 0),
		"bitgauge_http_request_duration_seconds")

	meter.Observe(GroupAPI, "/api/v1/download", http.StatusOK, 7)
	meter.Observe(GroupAPI, Unmatched, http.StatusNotFound, 0.002)
	// A status BitGauge does not answer, and a request that ended without any, count as other.
	meter.Observe(GroupSPA, Unmatched, http.StatusTeapot, 0.02)
	meter.Observe(GroupSPA, Unmatched, 0, 0.02)
	// A pattern the router does not mount counts as its group's unmatched route.
	meter.Observe(GroupAPI, "/api/v1/scanner", http.StatusNotFound, 0.002)

	compare(t, meter, `
# HELP bitgauge_http_requests_total Requests by route group, route pattern and status.
# TYPE bitgauge_http_requests_total counter
bitgauge_http_requests_total{code="200",group="api",route="/api/v1/download"} 1
bitgauge_http_requests_total{code="404",group="api",route="unmatched"} 2
bitgauge_http_requests_total{code="other",group="spa",route="unmatched"} 2
# HELP bitgauge_http_request_duration_seconds Request durations by route group and route pattern.
# TYPE bitgauge_http_request_duration_seconds histogram
`+histogram("api", "/api/v1/download", bucket7s, 1, 7)+
		histogram("api", Unmatched, bucket2ms, 2, 0.004)+
		histogram("spa", Unmatched, bucket20ms, 2, 0.04),
		"bitgauge_http_requests_total", "bitgauge_http_request_duration_seconds")
}

func TestEveryStatusHasItsCode(t *testing.T) {
	t.Parallel()

	answered := []int{101, 200, 204, 206, 304, 400, 403, 404, 405, 408, 411, 413, 416, 429, 500}
	for _, status := range answered {
		if got := codeLabels[codeSlot(status)]; got != strconv.Itoa(status) {
			t.Fatalf("status %d has code %q", status, got)
		}
	}

	for _, status := range []int{0, 100, 201, 302, 401, 418, 502, 503, 999} {
		if got := codeLabels[codeSlot(status)]; got != "other" {
			t.Fatalf("status %d has code %q, want other", status, got)
		}
	}
}

func TestEverySentinelIsMapped(t *testing.T) {
	t.Parallel()

	want := map[error]Limit{
		ratelimit.ErrStreams:    LimitStreams,
		ratelimit.ErrRate:       LimitRate,
		ratelimit.ErrWebSockets: LimitWebSocket,
		ratelimit.ErrFlows:      LimitNQFlows,
		ratelimit.ErrTableFull:  LimitTableFull,
	}

	for sentinel, limit := range want {
		meter := newTestMetrics(0)
		meter.Refused(fmt.Errorf("acquire: %w", sentinel))

		if got := testutil.ToFloat64(meter.refused[limit]); got != 1 {
			t.Fatalf("%v counted %v times under %s, want once", sentinel, got, limit)
		}

		total, err := testutil.GatherAndCount(meter.registry, "bitgauge_rate_limited_total")
		if err != nil || total != len(want) {
			t.Fatalf("%d rate_limited children (%v), want %d", total, err, len(want))
		}
	}

	meter := newTestMetrics(0)
	meter.Refused(errOther)

	for limit, counter := range meter.refused {
		if testutil.ToFloat64(counter) != 0 {
			t.Fatalf("an error that is not a limit counted under %s", limit)
		}
	}
}

func TestObserveAllocatesNothingOnceARouteAnswered(t *testing.T) {
	meter := newTestMetrics(0)
	meter.Observe(GroupAPI, "/api/v1/download", http.StatusOK, 1)

	allocs := testing.AllocsPerRun(100, func() {
		meter.Observe(GroupAPI, "/api/v1/download", http.StatusOK, 1)
		meter.Transfer(GroupAPI, Download).Add(1)
	})
	if allocs != 0 {
		t.Fatalf("Observe allocates %v times, want 0", allocs)
	}
}

func TestNilMetricsRecordNothing(t *testing.T) {
	t.Parallel()

	var meter *Metrics

	meter.Observe(GroupAPI, Unmatched, http.StatusOK, 1)
	meter.Refused(ratelimit.ErrRate)
	meter.WebSocketOpened()
	meter.WebSocketEchoed()
	meter.WebSocketClosed()

	transfer := meter.Transfer(GroupAPI, Upload)
	transfer.Start()
	transfer.Add(1)
	transfer.Abort()
	transfer.Timeout()
	transfer.Done()

	// A group without throughput routes has no transfer series either.
	if newTestMetrics(0).Transfer(GroupSPA, Download) != (Transfer{}) {
		t.Fatal("the spa group has transfer series")
	}
}

func TestRegistryHoldsTheRuntimeCollectors(t *testing.T) {
	t.Parallel()

	families, err := newTestMetrics(0).registry.Gather()
	if err != nil {
		t.Fatal(err)
	}

	var goSeen, processSeen bool

	for _, family := range families {
		goSeen = goSeen || strings.HasPrefix(family.GetName(), "go_")
		processSeen = processSeen || strings.HasPrefix(family.GetName(), "process_")
	}

	// The process collector reports nothing where procfs does not exist.
	if !goSeen || (runtime.GOOS == "linux" && !processSeen) {
		t.Fatalf("go_* %v, process_* %v; want both", goSeen, processSeen)
	}

	if prometheus.DefaultRegisterer.Unregister(collectorProbe{}) {
		t.Fatal("the metrics touched the default registry")
	}
}

// collectorProbe is a collector registered nowhere.
type collectorProbe struct{}

func (collectorProbe) Describe(chan<- *prometheus.Desc) {}
func (collectorProbe) Collect(chan<- prometheus.Metric) {}

func scrape(t *testing.T, handler http.Handler, accept string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/metrics", nil)
	request.Header.Set("Accept-Encoding", "gzip")

	if accept != "" {
		request.Header.Set("Accept", accept)
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	return recorder
}

func TestHandler(t *testing.T) {
	t.Parallel()

	handler := newTestMetrics(0).Handler(slog.New(slog.DiscardHandler))

	text := scrape(t, handler, "")
	if text.Code != http.StatusOK ||
		!strings.HasPrefix(text.Header().Get("Content-Type"), "text/plain") ||
		!strings.Contains(text.Body.String(), "bitgauge_build_info{") {
		t.Fatalf("status %d, Content-Type %q", text.Code, text.Header().Get("Content-Type"))
	}

	openMetrics := scrape(t, handler, "application/openmetrics-text;version=1.0.0")
	if !strings.HasPrefix(
		openMetrics.Header().Get("Content-Type"),
		"application/openmetrics-text",
	) ||
		!strings.HasSuffix(openMetrics.Body.String(), "# EOF\n") {
		t.Fatalf("Content-Type %q for an OpenMetrics scraper",
			openMetrics.Header().Get("Content-Type"))
	}

	for _, recorder := range []*httptest.ResponseRecorder{text, openMetrics} {
		if encoding := recorder.Header().Get("Content-Encoding"); encoding != "" {
			t.Fatalf("Content-Encoding = %q, want none", encoding)
		}
	}
}

// failingCollector fails every gather.
type failingCollector struct {
	desc *prometheus.Desc
}

func (c failingCollector) Describe(descs chan<- *prometheus.Desc) {
	descs <- c.desc
}

func (c failingCollector) Collect(metrics chan<- prometheus.Metric) {
	metrics <- prometheus.NewInvalidMetric(c.desc, errGather)
}

func TestHandlerAnswers500AndWarnsOnAGatherError(t *testing.T) {
	t.Parallel()

	meter := newTestMetrics(0)
	meter.registry.MustRegister(failingCollector{
		desc: prometheus.NewDesc("bitgauge_test_failing", "Fails.", nil, nil),
	})

	var logs bytes.Buffer

	recorder := scrape(t, meter.Handler(slog.New(slog.NewTextHandler(&logs, nil))), "")

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", recorder.Code)
	}

	line := logs.String()
	if strings.Count(line, "\n") != 1 || !strings.Contains(line, "level=WARN") ||
		!strings.Contains(line, errGather.Error()) {
		t.Fatalf("log = %q, want one warn line naming the error", line)
	}
}
