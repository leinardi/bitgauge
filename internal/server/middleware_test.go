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
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
)

var errBoom = errors.New("boom")

// fakeClock is the injected clock and timer source of the server tests. Timers fire, each in
// its own goroutine, when the test advances the clock past them; registered, when set,
// receives the duration of every new timer, so a test knows a timer exists, and for how
// long, before it advances.
type fakeClock struct {
	now        time.Time
	registered chan time.Duration
	timers     []*fakeTimer
	mu         sync.Mutex
}

type fakeTimer struct {
	at   time.Time
	fire func()
	done bool
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *fakeClock) Advance(elapsed time.Duration) {
	c.mu.Lock()

	c.now = c.now.Add(elapsed)

	var due []func()

	for _, timer := range c.timers {
		if !timer.done && !timer.at.After(c.now) {
			timer.done = true
			due = append(due, timer.fire)
		}
	}

	c.mu.Unlock()

	for _, fire := range due {
		go fire()
	}
}

func (c *fakeClock) AfterFunc(d time.Duration, fire func()) func() bool {
	c.mu.Lock()

	timer := &fakeTimer{at: c.now.Add(d), fire: fire}
	c.timers = append(c.timers, timer)

	c.mu.Unlock()

	if c.registered != nil {
		c.registered <- d
	}

	return func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()

		stopped := !timer.done
		timer.done = true

		return stopped
	}
}

// testChain is the global chain around a chi router, logging at level into logs.
func testChain(
	t *testing.T,
	router http.Handler,
	level slog.Level,
	clock *fakeClock,
) (http.Handler, *bytes.Buffer) {
	t.Helper()

	cfg := config.Defaults()
	logs := &bytes.Buffer{}
	log := slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{
		Level: level,
		// Without the timestamp, a digit in a log line can only come from the request.
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.TimeKey {
				return slog.Attr{}
			}

			return attr
		},
	}))

	if clock == nil {
		clock = &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	}

	return Chain(router, clientip.NewDeriver(nil), NewClassifier(&cfg), clock, log), logs
}

func get(t *testing.T, handler http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(
		recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil),
	)

	return recorder
}

// probedChain is the global chain with a probe in front of every stage: the probe records
// the stage's name on entry and, for the stage named panicIn, panics there instead.
func probedChain(
	t *testing.T,
	router http.Handler,
	panicIn string,
) (handler http.Handler, entered *[]string) {
	t.Helper()

	cfg := config.Defaults()
	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	chain := stages(nil, clientip.NewDeriver(nil), NewClassifier(&cfg), clock,
		slog.New(slog.DiscardHandler))
	entered = &[]string{}

	for index := range chain {
		inner := chain[index]
		chain[index].wrap = func(next http.Handler) http.Handler {
			wrapped := inner.wrap(next)

			return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				*entered = append(*entered, inner.name)
				if inner.name == panicIn {
					panic(errBoom)
				}

				wrapped.ServeHTTP(writer, request)
			})
		}
	}

	return compose(router, chain), entered
}

func TestChainOrder(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/api/v1/probe", func(http.ResponseWriter, *http.Request) {})

	handler, entered := probedChain(t, router, "")
	get(t, handler, "/api/v1/probe")

	if got := strings.Join(*entered, ","); got != "recovery,client-ip,headers,log" {
		t.Fatalf("stages entered in the order %s, want recovery, client-ip, headers, log", got)
	}

	// Chain is exactly these stages in this order around the router.
	cfg := config.Defaults()
	chain := stages(nil, clientip.NewDeriver(nil), NewClassifier(&cfg),
		&fakeClock{}, slog.New(slog.DiscardHandler))
	names := make([]string, 0, len(chain))

	for _, stage := range chain {
		names = append(names, stage.name)
	}

	if strings.Join(names, ",") != "recovery,client-ip,headers,log" {
		t.Fatalf("stages = %v", names)
	}
}

func TestPanicInsideEveryStageIsRecovered(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/api/v1/probe", func(http.ResponseWriter, *http.Request) {})

	// Recovery is outermost: a panic in any later stage, before or after the client IP is
	// derived and the headers are set, still answers the 500 envelope.
	for _, stage := range []string{"client-ip", "headers", "log"} {
		handler, _ := probedChain(t, router, stage)
		recorder := get(t, handler, "/api/v1/probe")

		if recorder.Code != http.StatusInternalServerError ||
			recorder.Header().Get("Content-Type") != "application/json" ||
			!strings.Contains(recorder.Body.String(), `"code":"internal"`) {
			t.Fatalf(
				"panic in %s: status %d, body %s",
				stage,
				recorder.Code,
				recorder.Body.String(),
			)
		}
	}
}

func TestStagesSeeTheEarlierOnes(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/api/v1/probe", func(writer http.ResponseWriter, request *http.Request) {
		// Client IP and the security headers have run when the router is reached.
		addr, derived := clientip.FromContext(request.Context())
		if !derived || addr.String() != "192.0.2.1" ||
			writer.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("client %v (%v), headers %v", addr, derived, writer.Header())
		}

		panic(errBoom)
	})

	handler, logs := testChain(t, router, slog.LevelDebug, nil)
	recorder := get(t, handler, "/api/v1/probe")

	// The headers set before the panic stay on the 500, and the request log, inside
	// recovery, wrote no line for the panicking request.
	if recorder.Code != http.StatusInternalServerError ||
		recorder.Header().Get("X-Content-Type-Options") != "nosniff" ||
		strings.Contains(logs.String(), "msg=request") {
		t.Fatalf("status %d, headers %v, logs %q", recorder.Code, recorder.Header(), logs.String())
	}
}

func TestPanicOnAPIRouteIsTheEnvelope(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/api/v1/things/{id}", func(http.ResponseWriter, *http.Request) {
		panic(errBoom)
	})

	handler, logs := testChain(t, router, slog.LevelInfo, nil)
	recorder := get(t, handler, "/api/v1/things/42?secret=query-value")

	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}

	err := json.Unmarshal(recorder.Body.Bytes(), &envelope)
	if err != nil || recorder.Code != http.StatusInternalServerError ||
		envelope.Error.Code != "internal" ||
		recorder.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("status %d, body %s", recorder.Code, recorder.Body.String())
	}

	line := logs.String()
	if !strings.Contains(line, "level=WARN") ||
		!strings.Contains(line, "route=/api/v1/things/{id}") ||
		strings.Contains(line, "42") ||
		strings.Contains(line, "query-value") {
		t.Fatalf("log = %q, want a warn line with the route pattern only", line)
	}
}

func TestPanicOnSPARouteIsPlain(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/assets/app.js", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

		panic(errBoom)
	})

	handler, _ := testChain(t, router, slog.LevelInfo, nil)
	recorder := get(t, handler, "/assets/app.js")

	// A shared cache must not keep the 500 for the asset's lifetime.
	if recorder.Code != http.StatusInternalServerError ||
		!strings.HasPrefix(recorder.Header().Get("Content-Type"), "text/plain") ||
		recorder.Header().Get("Content-Security-Policy") == "" ||
		recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d, headers %v", recorder.Code, recorder.Header())
	}
}

func TestRecoveryCompletesTheRouteContext(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/routes", func(_ http.ResponseWriter, request *http.Request) {
		// chi middleware such as GetHead reads the router from the route context.
		if chi.RouteContext(request.Context()).Routes != router {
			t.Error("the route context does not carry the router")
		}
	})

	handler, _ := testChain(t, router, slog.LevelInfo, nil)
	get(t, handler, "/routes")
}

func TestPanicsThatCannotBeAnswered(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/abort", func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) })
	router.Get("/late", func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(writer, "partial")

		panic(errBoom)
	})

	handler, _ := testChain(t, router, slog.LevelInfo, nil)

	for _, target := range []string{"/abort", "/late"} {
		func() {
			defer func() {
				recovered, _ := recover().(error)
				if !errors.Is(recovered, http.ErrAbortHandler) {
					t.Fatalf("%s: recovered %v, want http.ErrAbortHandler", target, recovered)
				}
			}()

			get(t, handler, target)
		}()
	}
}

func TestRequestLogLineAtDebugOnly(t *testing.T) {
	t.Parallel()

	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	router := chi.NewRouter()
	router.Get("/api/v1/download", func(writer http.ResponseWriter, _ *http.Request) {
		clock.Advance(1500 * time.Millisecond)

		_, _ = io.WriteString(writer, "12345")
	})

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/api/v1/download?bytes=4242&token=query-secret", nil)

	for name, value := range map[string]string{
		"User-Agent":      "ua-secret",
		"Referer":         "https://referer-secret.example/",
		"Cookie":          "session=cookie-secret",
		"X-Forwarded-For": "203.0.113.77",
		"Authorization":   "Bearer auth-secret",
	} {
		request.Header.Set(name, value)
	}

	handler, logs := testChain(t, router, slog.LevelDebug, clock)
	handler.ServeHTTP(httptest.NewRecorder(), request)

	line := logs.String()
	for _, want := range []string{
		"level=DEBUG", "msg=request", "method=GET", "route=/api/v1/download", "status=200",
		"bytes=5", "duration=1.5s", "client=192.0.2.1",
	} {
		if !strings.Contains(line, want) {
			t.Fatalf("log line %q lacks %q", line, want)
		}
	}

	for _, secret := range []string{
		"ua-secret", "referer-secret", "cookie-secret", "203.0.113.77", "auth-secret",
		"query-secret", "4242",
	} {
		if strings.Contains(line, secret) {
			t.Fatalf("log line %q contains %q", line, secret)
		}
	}

	quiet, quietLogs := testChain(t, router, slog.LevelInfo, clock)
	quiet.ServeHTTP(httptest.NewRecorder(), request)

	if quietLogs.Len() != 0 {
		t.Fatalf("a request line at info: %q", quietLogs.String())
	}
}

func TestRequestLogUnmatchedAndImplicitStatus(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/silent", func(http.ResponseWriter, *http.Request) {})

	handler, logs := testChain(t, router, slog.LevelDebug, nil)
	get(t, handler, "/silent")
	get(t, handler, "/nowhere")

	if !strings.Contains(logs.String(), "route=/silent status=200") ||
		!strings.Contains(logs.String(), "route=unmatched status=404") {
		t.Fatalf("logs = %q", logs.String())
	}
}

func TestChainKeepsTheResponseControllerReachable(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	router.Get("/api/v1/flush", func(writer http.ResponseWriter, _ *http.Request) {
		err := http.NewResponseController(writer).Flush()
		if err != nil {
			t.Errorf("flush through the chain: %v", err)
		}
	})

	handler, _ := testChain(t, router, slog.LevelDebug, nil)

	if recorder := get(t, handler, "/api/v1/flush"); !recorder.Flushed {
		t.Fatal("the flush did not reach the underlying writer")
	}
}
