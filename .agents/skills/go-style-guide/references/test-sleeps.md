# Time in tests — BitGauge

Detail for §18 of [the Go style guide](../SKILL.md). Read it before writing code that depends on
time, a wait in a test, or a `time.Sleep` in a `_test.go` file.

BitGauge measures time for a living, so its tests treat time as an input. The testing strategy is
written around fakes: the Go handler tests use a fake monotonic clock, and the engine runs against
a fake `Clock` replaying synthetic timelines
([testing.md §1 and §2](../../../../docs/features/technical-stack/testing.md#1-go-handler-tests)).
A sleep in a unit test is a sign that a clock was not injected.

## The production side: take the clock as an input

- **Go.** Code whose behaviour depends on time takes a clock or monotonic time source from its
  caller instead of calling `time.Now` or `time.Since` itself. The upload grid is the defining
  case: each read lands in `cell = floor((monotonic now − process start) / 100 ms) + K`
  ([backend.md §2](../../../../docs/features/technical-stack/backend.md#2-handler-rules)), and
  testing.md §1 requires "grid counts with a fake monotonic clock (reads in known cells,
  `firstBucket = floor(startMs / 100)`, `Σ buckets == bytes`, at most 1201 entries)" and the
  `408` "after the 120 s lifetime (fake clock)". The same applies to anything else with a window:
  rate-limit refill and `Retry-After`, the WebSocket idle close. The shared clock is
  `ratelimit.Clock` (with `ratelimit.Timers` for scheduled work such as the idle close), which the
  handlers' upload grid takes too: use it, rather than giving a package a clock of its own.
- **Engine.** `web/src/engine/` never calls `performance.now()`, `setTimeout`, `fetch`,
  `XMLHttpRequest` or `WebSocket` directly. It receives a `Clock` (`now()`, `setTimer(ms, fn)`,
  `clearTimer(id)`) and a `Transport`; production wires the browser implementations and vitest
  wires fakes that replay a timeline
  ([frontend.md §2](../../../../docs/features/technical-stack/frontend.md#2-engine-package-rules),
  [decisions.md §12](../../../../docs/features/technical-stack/decisions.md)). Every rule takes the
  injected clock, never a global one.

## Decide what the test is waiting for

Classify the wait before writing it; the class dictates the shape.

### Something another goroutine will do: synchronize, never sleep

"The handler has drained the body", "the limiter released the slot", "the echo arrived". In a
unit test, wait on a signal the code under test already produces: the returned response, a
channel, a `sync.WaitGroup`, a hook the test passes in. If nothing observable exists, add a small
seam to the production type (an injected callback, the clock) rather than guessing a duration. A
`time.Sleep` that "gives X time to Y" is always wrong here.

### A real duration under test: advance the fake clock

A 100 ms grid cell, the 120 s upload lifetime, the 120 s WebSocket idle close, a token-bucket
refill. The duration is the thing under test, so the test advances the fake clock by exactly that
window (named as the constant under test, or a multiple of it) and asserts the outcome. Never wait
it out in real time: a 120 s test is a test nobody runs, and a shortened real window changes what
is asserted.

### Nothing happens: advance past the window, then assert

"No telemetry on a `408`", "the slot is not released early". With a fake clock there is a precise
moment to check: advance to just before and just past the boundary and assert both sides. No
sleep is needed, and the boundary is exact rather than "probably long enough".

### Ordering between goroutines: use a barrier

"Let the reader block before closing the connection". Use a channel or a hook in the code under
test. If no such seam exists, that is the bug to fix; a sleep only makes the ordering likely.

## Docker-backed tests: poll with a deadline

The tests behind the `image` build tag (`test/image`, run by `make go-test-image`) and the
`harness` tag (`test/harness`, run by `make harness-ci` and the other harness targets) drive real
containers and real networks. There is no clock to inject, so a positive eventual wait polls a
condition until a deadline, fails naming what it waited for, and stops early when the test context
ends. Reuse the existing helpers rather than writing a new loop:

- `eventually(t, what, check)` in [`test/image/main_test.go`](../../../../test/image/main_test.go);
- `poll(ctx, check)` in [`test/harness/topology.go`](../../../../test/harness/topology.go).

Both wait between attempts with `select` on the context and `time.After`, not with `time.Sleep`,
so a cancelled run does not sit out the interval. A poll loop belongs only in these tagged tests;
in an untagged unit test it means the code under test needs a clock or a signal.

## Always wrong

- `time.Sleep` in a unit test to wait for state.
- `time.Now`, `time.Since` or a real timer inside code whose timing a test must control.
- A real-time wait for a window the docs define (100 ms, 30 s, 120 s) instead of advancing a fake
  clock.
- A sleep added to make a flaky test pass without deciding which class above it belongs to.
