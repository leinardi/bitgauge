# Stacks: the servers, the demo and the proxy

Everything lives under one scratch directory (`/tmp/qa/stacks/`): a config file and a log per
server, and a `pids` file with every process the round started. Bind to `127.0.0.1`, on ports
from 18080 up, each checked free with `ss -ltn` before it starts. The configuration keys are in
[configuration.md §2](../../../../docs/features/configuration.md#2-keys); each one has an
environment variable, so most stacks need no file.

## The real server

```bash
BITGAUGE_SERVER__LISTEN=127.0.0.1:18080 BITGAUGE_LOG__LEVEL=debug \
  ./dist/bitgauge serve >/tmp/qa/stacks/default.log 2>&1 &
echo "default $!" >>/tmp/qa/stacks/pids
```

`make run` serves on `0.0.0.0` in the foreground; a round starts the binary itself.

| Port | Configuration | For |
| --- | --- | --- |
| `18080` | defaults | the Test screen, a full run, history, settings, sharing |
| `18081` | every compatibility layer on, `metrics.enabled: true`, `server.public_url: https://speed.qa.test` (the networkQuality layer refuses to start without an https `public_url` or a trusted proxy) | About, the layers' routes and CORS, `/metrics` |
| `18082` | `server.base_path: /speed` | every route and the SPA under the base path, and a request outside it ([edge-cases.md §20](../../../../docs/features/edge-cases.md#20-base-path-mismatches)) |
| `18083` | low limits: `max_streams_per_client: 2` with `test_defaults.streams.max: 2` and `test_defaults.streams.fixed: 2` (neither may exceed the one before it), `requests_per_minute: 60`, `max_download_bytes: 64KiB` | the 429s, `Retry-After`, the caps and how the app reads them |
| `18084` | `test_defaults` off their defaults: `preset: quick`, `units: bytes`, `data_cap: 50MiB`, `phases: download,upload`, `server.labels` mapping `127.0.0.0/8` | the server defaults reaching Settings, the summary and the run |
| `18085` | `server.trusted_proxies: [127.0.0.2/32]`, behind the proxy below | the client IP, the label, `X-Forwarded-Proto` |

Add one only when an area needs it; one agent per port when fanning out (SKILL.md §4).

**Fail-closed configuration** needs no running server: start the binary with a bad value (an
unknown key, `streams.max` above `max_streams_per_client`, a `min_duration` above its
`max_duration`, a malformed CIDR) and check it exits with status 2 and says why
([configuration.md §4](../../../../docs/features/configuration.md#4-fail-closed-validation)).
`./dist/bitgauge healthcheck` against a running and a stopped server checks the other subcommand.

## The demo

```bash
PARITY_DEMO_PORT=18090 PARITY_PROTO_PORT=18091 make demo-parity-servers \
  >/tmp/qa/stacks/demo.log 2>&1 &
```

That builds the demo and serves it on `18090`, with the design kit's prototype on `18091` to
compare against; it prints both URLs. When fanning out, each agent needs a demo origin of its own:
build once (`npm --prefix web run build:demo`) and serve `web/dist-demo` once per agent, from
`web/`:

```bash
npx vite preview --outDir dist-demo --host 127.0.0.1 --port 18092 --strictPort &
```

The preview serves only `/`: a deep link such as `/result/<id>` loads blank, so navigate from `/`.

Choose a scenario in the demo panel, or write the panel's choice before the page loads: it is JSON
in `localStorage` under `bitgauge-demo`, read field by field (`web/src/demo/choice.ts`), so
`localstorage-set` then `reload` picks a scenario, a speed and an error kind without clicking.
A forced state holds the run there.

The demo has no server: its routes, limits and headers are simulated, so nothing about the HTTP
edge is checked on it.

## The proxy

For HTTP/2 and TLS, put Caddy (the `caddy:2` image of
[`deployments/examples/caddy/`](../../../../deployments/examples/caddy/)) in front of the default
server: a Caddyfile in the scratch directory with the example's settings, its site address changed
to `localhost:18443`, `tls internal`, and `reverse_proxy 127.0.0.1:18080`, run with
`docker run --rm -d --network host -v <scratch>/Caddyfile:/etc/caddy/Caddyfile caddy:2`. Its
certificate is Caddy's own, so open the session with `--config <scratch>/cli.config.json` holding
`{"browser": {"contextOptions": {"ignoreHTTPSErrors": true}}}`. The browser then negotiates
HTTP/2, which the Test screen's protocol and the upload's behavior after a failed request depend
on ([edge-cases.md §3](../../../../docs/features/edge-cases.md#3-http2-vs-http11-via-the-proxy)).
Without `trusted_proxies` the server sees Caddy as the client, which is what this stack is for; the
client IP is the next one's.

For the client IP alone, a few lines of Python in the scratch directory serve: listen on
`127.0.0.1:18086`, bind the upstream connection to `127.0.0.2` so the server sees a trusted peer,
and add the `X-Forwarded-For` the check needs. `curl --interface 127.0.0.2` reaches the server as
the trusted peer directly, for header tests a proxy would normalize away (a repeated header, a
spoofed chain). The rules are in [security.md §4](../../../../docs/features/security.md#4-client-ip-and-trusted-proxies).

## Cleanup

Kill every PID in `pids` and stop the Caddy container, then check `ss -ltn` shows none of the
round's ports, close every playwright-cli session (`close-all`), delete the scratch directory, and
say in the report that it is done.
