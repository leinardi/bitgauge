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

// Package web embeds the built SPA and serves it (architecture.md section 3): index.html rendered
// once at startup with the base path, the content-hashed assets, and the design export's root
// assets, on the fixed route list only. It holds the embed, the templating and the route handler,
// and nothing else: golangci-lint does not read this directory.
package web

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"html"
	"io"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// The whole of dist, dotfiles included: on a clean checkout it holds only .gitkeep, and a pattern
// that matched nothing would not compile.
//
//go:embed all:dist
var embedded embed.FS

const (
	cacheDocument = "no-cache"
	cacheHashed   = "public, max-age=31536000, immutable"
	// The root assets keep their names across releases, so they are cached for a day only.
	cacheRoot = "public, max-age=86400"

	contentTypeHTML = "text/html; charset=utf-8"
	assetsPrefix    = "/assets/"
)

// DocumentRoutes are the SPA's fixed routes, each answered with index.html (compatibility.md
// section 1.5), in chi's syntax under the base path.
var DocumentRoutes = []string{"/", "/result/{id}", "/history", "/settings", "/about"}

// AssetRoutes is the pattern of the content-hashed assets.
const AssetRoutes = assetsPrefix + "*"

// RootAssets are the design export's files served from the base path itself, with their content
// types (architecture.md section 3). It is a file list, never a catch-all.
var RootAssets = map[string]string{
	"favicon.svg":           "image/svg+xml",
	"favicon-16.png":        "image/png",
	"favicon-32.png":        "image/png",
	"apple-touch-icon.png":  "image/png",
	"icon-192.png":          "image/png",
	"icon-512.png":          "image/png",
	"icon-512-maskable.png": "image/png",
	"site.webmanifest":      "application/manifest+json",
}

var (
	errMissing    = errors.New("the embedded SPA is incomplete; build it with make build")
	errTemplate   = errors.New("index.html is not the template the server expects")
	metaBasePath  = regexp.MustCompile(`<meta name="bitgauge-base-path" content="[^"]*"`)
	relativeAsset = regexp.MustCompile(`((?:src|href)=")\./`)
)

// SPA is the rendered SPA: index.html with the base path written in, and the files beside it.
type SPA struct {
	index []byte
	dist  fs.FS
}

// Render renders the embedded SPA for basePath, once, at startup.
func Render(basePath string) (*SPA, error) {
	dist, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, fmt.Errorf("the embedded dist: %w", err)
	}

	return RenderFS(dist, basePath)
}

// RenderFS renders the SPA in dist for basePath: it writes the base path into the meta element
// and makes the asset URLs, which the build leaves relative, absolute under it. It fails when
// index.html or a root asset is missing, or when index.html has no single meta element to fill.
func RenderFS(dist fs.FS, basePath string) (*SPA, error) {
	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		return nil, fmt.Errorf("%w: index.html: %w", errMissing, err)
	}

	for name := range RootAssets {
		info, statErr := fs.Stat(dist, name)
		if statErr != nil || info.IsDir() {
			return nil, fmt.Errorf("%w: %s is missing", errMissing, name)
		}
	}

	if count := len(metaBasePath.FindAll(index, -1)); count != 1 {
		return nil, fmt.Errorf(
			"%w: %d bitgauge-base-path meta elements, want 1",
			errTemplate,
			count,
		)
	}

	base := strings.TrimSuffix(basePath, "/")
	prefix := html.EscapeString(base + "/")

	index = metaBasePath.ReplaceAllLiteral(index,
		[]byte(`<meta name="bitgauge-base-path" content="`+html.EscapeString(nonEmpty(base))+`"`))
	index = relativeAsset.ReplaceAll(index, []byte("${1}"+strings.ReplaceAll(prefix, "$", "$$")))

	for name := range RootAssets {
		index = bytes.ReplaceAll(index, []byte(`href="`+name+`"`), []byte(`href="`+prefix+name+`"`))
	}

	return &SPA{index: index, dist: dist}, nil
}

// nonEmpty is the root base path as "/" rather than "".
func nonEmpty(base string) string {
	if base == "" {
		return "/"
	}

	return base
}

// Routes registers the SPA's routes on r, which is mounted at the base path: index.html for the
// fixed routes, the hashed assets, and the root assets by name. Anything else is r's 404.
func (s *SPA) Routes(r chi.Router) {
	for _, pattern := range DocumentRoutes {
		r.Get(pattern, s.serveIndex)
	}

	r.Get(AssetRoutes, s.serveAsset)

	for name, contentType := range RootAssets {
		r.Get("/"+name, s.serveRoot(name, contentType))
	}
}

func (s *SPA) serveIndex(w http.ResponseWriter, _ *http.Request) {
	header := w.Header()
	header.Set("Content-Type", contentTypeHTML)
	header.Set("Cache-Control", cacheDocument)
	_, _ = w.Write(s.index)
}

// serveAsset serves a file under assets/ by its name; a directory or a missing file is 404.
func (s *SPA) serveAsset(w http.ResponseWriter, r *http.Request) {
	name := path.Clean(strings.TrimPrefix(chi.URLParam(r, "*"), "/"))
	if name == "." || strings.HasPrefix(name, "../") || !fs.ValidPath(name) {
		http.NotFound(w, r)

		return
	}

	s.serveFile(w, r, path.Join("assets", name), "", cacheHashed)
}

func (s *SPA) serveRoot(name, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.serveFile(w, r, name, contentType, cacheRoot)
	}
}

// serveFile answers a regular file of the dist with its cache policy; an empty content type is
// read from the name's extension, as http.ServeContent does. Embedded files have no modification
// time, so no Last-Modified is sent; the hashed names and the cache policy do that job.
func (s *SPA) serveFile(w http.ResponseWriter, r *http.Request, name, contentType, cache string) {
	file, err := s.dist.Open(name)
	if err != nil {
		http.NotFound(w, r)

		return
	}

	defer func() { _ = file.Close() }()

	info, err := file.Stat()
	content, seekable := file.(io.ReadSeeker)

	if err != nil || info.IsDir() || !seekable {
		http.NotFound(w, r)

		return
	}

	header := w.Header()
	if contentType != "" {
		header.Set("Content-Type", contentType)
	}

	header.Set("Cache-Control", cache)
	http.ServeContent(w, r, name, time.Time{}, content)
}
