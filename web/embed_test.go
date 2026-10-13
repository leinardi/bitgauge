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

package web_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/web"
)

// template is index.html as the web build writes it: relative asset URLs, the root assets'
// links by bare name, and the meta element with the root base path.
const template = `<!doctype html><html><head>
<meta name="bitgauge-base-path" content="/" />
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="site.webmanifest" />
<script type="module" crossorigin src="./assets/index-a1.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-b2.css">
</head><body><div id="app"></div></body></html>`

const manifest = `{"id":"./","start_url":"./","scope":"./","icons":[{"src":"icon-192.png"}]}`

func dist() fstest.MapFS {
	files := fstest.MapFS{
		".gitkeep":            {},
		"index.html":          {Data: []byte(template)},
		"assets/index-a1.js":  {Data: []byte("export {}")},
		"assets/index-b2.css": {Data: []byte("body{}")},
		"assets/fonts/x.txt":  {Data: []byte("nested")},
	}

	for name := range web.RootAssets {
		files[name] = &fstest.MapFile{Data: []byte("bytes of " + name)}
	}

	files["site.webmanifest"] = &fstest.MapFile{Data: []byte(manifest)}

	return files
}

// server serves the SPA rendered for basePath, mounted there as the router mounts it.
func server(t *testing.T, files fstest.MapFS, basePath string) *httptest.Server {
	t.Helper()

	spa, err := web.RenderFS(files, basePath)
	if err != nil {
		t.Fatal(err)
	}

	router := chi.NewRouter()
	if base := strings.TrimSuffix(basePath, "/"); base == "" {
		spa.Routes(router)
	} else {
		router.Route(base, spa.Routes)
	}

	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)

	return srv
}

type answer struct {
	status int
	header http.Header
	body   string
}

func get(t *testing.T, srv *httptest.Server, path string) answer {
	t.Helper()

	request, err := http.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		srv.URL+path,
		http.NoBody,
	)
	if err != nil {
		t.Fatal(err)
	}

	response, err := srv.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = response.Body.Close() }()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}

	return answer{status: response.StatusCode, header: response.Header, body: string(body)}
}

func TestRenderWritesTheBasePath(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		basePath string
		prefix   string
		meta     string
	}{
		{"/", "/", "/"},
		{"/speed", "/speed/", "/speed"},
		{"/speed/", "/speed/", "/speed"},
	} {
		srv := server(t, dist(), test.basePath)
		body := get(t, srv, test.prefix).body

		for _, want := range []string{
			`<meta name="bitgauge-base-path" content="` + test.meta + `"`,
			`href="` + test.prefix + `favicon.svg"`,
			`href="` + test.prefix + `site.webmanifest"`,
			`src="` + test.prefix + `assets/index-a1.js"`,
			`href="` + test.prefix + `assets/index-b2.css"`,
		} {
			if !strings.Contains(body, want) {
				t.Errorf("base path %s: index.html lacks %s:\n%s", test.basePath, want, body)
			}
		}

		if strings.Contains(body, `"./`) {
			t.Errorf("base path %s: a relative URL is left:\n%s", test.basePath, body)
		}
	}
}

func TestRoutesServeTheFixedListOnly(t *testing.T) {
	t.Parallel()

	srv := server(t, dist(), "/speed")

	for _, path := range []string{"/speed/", "/speed/result/0b6f", "/speed/history", "/speed/settings", "/speed/about"} {
		got := get(t, srv, path)
		if got.status != http.StatusOK || got.header.Get("Cache-Control") != "no-cache" ||
			got.header.Get("Content-Type") != "text/html; charset=utf-8" ||
			!strings.Contains(got.body, `content="/speed"`) {
			t.Errorf("%s: %d %v", path, got.status, got.header)
		}
	}

	for _, path := range []string{
		"/speed/unknown", "/unknown", "/speed/result/", "/speed/index.html", "/speed/assets/",
		"/speed/assets/missing.js", "/speed/assets/fonts", "/speed/.gitkeep", "/favicon.svg",
	} {
		if got := get(t, srv, path); got.status != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", path, got.status)
		}
	}
}

func TestAssetsAreImmutable(t *testing.T) {
	t.Parallel()

	srv := server(t, dist(), "/")

	for path, contentType := range map[string]string{
		"/assets/index-a1.js":  "text/javascript; charset=utf-8",
		"/assets/index-b2.css": "text/css; charset=utf-8",
		"/assets/fonts/x.txt":  "text/plain; charset=utf-8",
	} {
		got := get(t, srv, path)
		if got.status != http.StatusOK ||
			got.header.Get("Cache-Control") != "public, max-age=31536000, immutable" ||
			got.header.Get("Content-Type") != contentType {
			t.Errorf("%s: %d %v", path, got.status, got.header)
		}
	}
}

func TestRootAssetsUnderTheBasePath(t *testing.T) {
	t.Parallel()

	for _, test := range []struct{ basePath, prefix string }{{"/", "/"}, {"/speed", "/speed/"}} {
		srv := server(t, dist(), test.basePath)

		for name, contentType := range web.RootAssets {
			got := get(t, srv, test.prefix+name)
			if got.status != http.StatusOK || got.header.Get("Content-Type") != contentType ||
				got.header.Get("Cache-Control") != "public, max-age=86400" {
				t.Errorf("%s%s: %d %v", test.prefix, name, got.status, got.header)
			}
		}
	}

	// Without the base path, a root asset under /speed/ is just an unknown path.
	if got := get(
		t,
		server(t, dist(), "/"),
		"/speed/favicon.svg",
	); got.status != http.StatusNotFound {
		t.Errorf("/speed/favicon.svg without the base path: %d, want 404", got.status)
	}
}

func TestManifestIsServedUnchanged(t *testing.T) {
	t.Parallel()

	// Its ./ start_url and scope resolve against the manifest's own URL, under the base path.
	if got := get(t, server(t, dist(), "/speed"), "/speed/site.webmanifest"); got.body != manifest {
		t.Errorf("manifest body %q, want %q", got.body, manifest)
	}
}

func TestRenderFailsOnAnIncompleteDist(t *testing.T) {
	t.Parallel()

	withoutIcon := dist()
	delete(withoutIcon, "icon-512.png")

	withoutMeta := dist()
	withoutMeta["index.html"] = &fstest.MapFile{Data: []byte("<html></html>")}

	twoMetas := dist()
	twoMetas["index.html"] = &fstest.MapFile{Data: []byte(template + template)}

	for name, test := range map[string]struct {
		files fstest.MapFS
		want  string
	}{
		"a clean checkout":  {fstest.MapFS{".gitkeep": {}}, "the embedded SPA is incomplete; build it with make build: index.html"},
		"a root asset":      {withoutIcon, "icon-512.png is missing"},
		"no meta element":   {withoutMeta, "0 bitgauge-base-path meta elements, want 1"},
		"two meta elements": {twoMetas, "2 bitgauge-base-path meta elements, want 1"},
	} {
		_, err := web.RenderFS(test.files, "/")
		if err == nil || !strings.Contains(err.Error(), test.want) {
			t.Errorf("%s: error %v, want one containing %q", name, err, test.want)
		}
	}
}
