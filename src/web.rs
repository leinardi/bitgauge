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

//! The embedded SPA (architecture.md section 3): `index.html` rendered once at startup with the
//! base path, the content-hashed assets, and the design export's root assets, on the fixed route
//! list only.

use std::collections::BTreeMap;
use std::sync::{Arc, LazyLock};

use axum::Router;
use axum::extract::Request;
use axum::routing::{MethodRouter, any};
use bytes::Bytes;
use http::header::{ALLOW, CACHE_CONTROL, CONTENT_TYPE};
use http::{HeaderValue, Method, Response, StatusCode};
use include_dir::{Dir, DirEntry, include_dir};
use regex::bytes::Regex;

use crate::handlers::Body;

mod files;
#[cfg(test)]
mod tests;

use files::serve_file;
pub use files::{not_found, plain_error};

/// The whole of `web/dist`, dotfiles included: on a clean checkout it holds only `.gitkeep`.
static DIST: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/web/dist");

const CACHE_DOCUMENT: &str = "no-cache";
const CACHE_HASHED: &str = "public, max-age=31536000, immutable";
/// The root assets keep their names across releases, so they are cached for a day only.
const CACHE_ROOT: &str = "public, max-age=86400";
const CONTENT_TYPE_HTML: &str = "text/html; charset=utf-8";

/// The methods of every SPA route: `GET`, and `HEAD` with it (`docs/rust-port.md` row 12).
pub const METHODS: &[Method] = &[Method::GET, Method::HEAD];
/// The Allow value of an SPA route's 405.
const ALLOW_SPA: &str = "GET, HEAD";

/// The SPA's fixed routes, each answered with `index.html` (compatibility.md section 1.5).
pub const DOCUMENT_ROUTES: [&str; 5] = ["/", "/result/{id}", "/history", "/settings", "/about"];
/// The pattern of the content-hashed assets, as the route table writes it.
pub const ASSET_ROUTES: &str = "/assets/*";
/// The design export's files served from the base path itself, with their content types,
/// sorted by name. It is a file list, never a catch-all.
pub const ROOT_ASSETS: [(&str, &str); 8] = [
    ("apple-touch-icon.png", "image/png"),
    ("favicon-16.png", "image/png"),
    ("favicon-32.png", "image/png"),
    ("favicon.svg", "image/svg+xml"),
    ("icon-192.png", "image/png"),
    ("icon-512-maskable.png", "image/png"),
    ("icon-512.png", "image/png"),
    ("site.webmanifest", "application/manifest+json"),
];

static META_BASE_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<meta name="bitgauge-base-path" content="[^"]*""#).unwrap_or_else(|error| {
        unreachable!("the meta pattern is a valid regular expression: {error}")
    })
});
static RELATIVE_ASSET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"((?:src|href)=")\./"#).unwrap_or_else(|error| {
        unreachable!("the asset pattern is a valid regular expression: {error}")
    })
});

/// The SPA's route patterns as the route table writes them: the documents, the assets, then the
/// root assets.
#[must_use]
pub fn route_patterns() -> Vec<String> {
    DOCUMENT_ROUTES
        .iter()
        .map(|&route| route.to_owned())
        .chain([ASSET_ROUTES.to_owned()])
        .chain(ROOT_ASSETS.iter().map(|(name, _)| format!("/{name}")))
        .collect()
}

/// The files of a built SPA, by their path relative to its root.
pub type Files = BTreeMap<String, Bytes>;

/// Why the SPA cannot be served; startup fails on it.
#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    /// `index.html` or a root asset is not in the build.
    #[error("the embedded SPA is incomplete; build it with make build: {0}")]
    Missing(String),
    /// `index.html` has not exactly one meta element to fill.
    #[error(
        "index.html is not the template the server expects: {0} bitgauge-base-path meta elements, want 1"
    )]
    Template(usize),
}

/// The rendered SPA: `index.html` with the base path written in, and the files beside it.
#[derive(Debug)]
pub struct Spa {
    index: Bytes,
    files: Files,
}

impl Spa {
    /// Renders the embedded SPA for `base_path`, once, at startup.
    ///
    /// # Errors
    ///
    /// [`RenderError`] when the build is incomplete or `index.html` is not the template.
    pub fn render(base_path: &str) -> Result<Self, RenderError> {
        let mut files = Files::new();
        collect(&DIST, &mut files);
        Self::render_files(files, base_path)
    }

    /// Renders the SPA in `files` for `base_path`: it writes the base path into the meta element
    /// and makes the asset URLs, which the build leaves relative, absolute under it.
    ///
    /// # Errors
    ///
    /// [`RenderError`] when `index.html` or a root asset is missing, or when `index.html` has no
    /// single meta element to fill.
    pub fn render_files(files: Files, base_path: &str) -> Result<Self, RenderError> {
        let index = files
            .get("index.html")
            .ok_or_else(|| RenderError::Missing("index.html".to_owned()))?;
        if let Some((name, _)) = ROOT_ASSETS
            .iter()
            .find(|(name, _)| !files.contains_key(*name))
        {
            return Err(RenderError::Missing(format!("{name} is missing")));
        }
        let count = META_BASE_PATH.find_iter(index).count();
        if count != 1 {
            return Err(RenderError::Template(count));
        }
        let base = base_path.strip_suffix('/').unwrap_or(base_path);
        let prefix = escape_html(&format!("{base}/"));
        let meta = format!(
            r#"<meta name="bitgauge-base-path" content="{}""#,
            escape_html(if base.is_empty() { "/" } else { base })
        );
        let index = META_BASE_PATH.replace_all(index, regex::bytes::NoExpand(meta.as_bytes()));
        let assets = format!("${{1}}{}", prefix.replace('$', "$$"));
        let mut index = RELATIVE_ASSET
            .replace_all(&index, assets.as_bytes())
            .into_owned();
        for (name, _) in ROOT_ASSETS {
            index = replace_bytes(
                &index,
                format!(r#"href="{name}""#).as_bytes(),
                format!(r#"href="{prefix}{name}""#).as_bytes(),
            );
        }
        Ok(Self {
            index: Bytes::from(index),
            files,
        })
    }

    /// The SPA's routes under `base_path` (`/speed`, or empty at the root): `index.html` for the
    /// fixed routes, the hashed assets, and the root assets by name. Anything else is the outer
    /// router's 404. With a base path, its bare form serves the document too, as Go's mount did.
    pub fn routes(self: &Arc<Self>, base: &str) -> Router {
        let mut router = Router::new();
        for document in DOCUMENT_ROUTES {
            let spa = Arc::clone(self);
            let index = spa_route(move |_request: Request| {
                let spa = Arc::clone(&spa);
                async move { spa.document() }
            });
            if document == "/" && !base.is_empty() {
                router = router.route(base, index.clone());
            }
            router = router.route(&format!("{base}{document}"), index);
        }
        let spa = Arc::clone(self);
        let assets: Arc<str> = Arc::from(format!("{base}/assets/"));
        router = router.route(
            &format!("{base}/assets/{{*path}}"),
            spa_route(move |request: Request| {
                let spa = Arc::clone(&spa);
                let assets = Arc::clone(&assets);
                async move { spa.asset(&request, &assets) }
            }),
        );
        for (name, content_type) in ROOT_ASSETS {
            let spa = Arc::clone(self);
            router = router.route(
                &format!("{base}/{name}"),
                spa_route(move |request: Request| {
                    let spa = Arc::clone(&spa);
                    async move { spa.serve(&request, name, Some(content_type), CACHE_ROOT) }
                }),
            );
        }
        router
    }

    fn document(&self) -> Response<Body> {
        let mut response = Response::new(Body::from(self.index.clone()));
        let headers = response.headers_mut();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static(CONTENT_TYPE_HTML));
        headers.insert(CACHE_CONTROL, HeaderValue::from_static(CACHE_DOCUMENT));
        response
    }

    /// A file under `assets/` by its name, cleaned as Go's `path.Clean` cleans it; a directory,
    /// a missing file or a name that leaves `assets/` is 404.
    fn asset(&self, request: &Request, assets: &str) -> Response<Body> {
        let Some(tail) = request.uri().path().strip_prefix(assets) else {
            return not_found();
        };
        let name = clean(tail.strip_prefix('/').unwrap_or(tail));
        if name == "." || name.starts_with("../") || !valid_path(&name) {
            return not_found();
        }
        self.serve(request, &format!("assets/{name}"), None, CACHE_HASHED)
    }

    fn serve(
        &self,
        request: &Request,
        name: &str,
        content_type: Option<&'static str>,
        cache: &'static str,
    ) -> Response<Body> {
        self.files.get(name).map_or_else(not_found, |content| {
            serve_file(request, name, content.clone(), content_type, cache)
        })
    }
}

/// An SPA route: `GET` and `HEAD` reach `handler`, any other method answers a plain 405 with
/// Allow and no body.
fn spa_route<H, F>(handler: H) -> MethodRouter
where
    H: Fn(Request) -> F + Clone + Send + Sync + 'static,
    F: Future<Output = Response<Body>> + Send + 'static,
{
    any(move |request: Request| {
        let handler = handler.clone();
        async move {
            if request.method() == Method::GET || request.method() == Method::HEAD {
                return handler(request).await;
            }
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::METHOD_NOT_ALLOWED;
            response
                .headers_mut()
                .insert(ALLOW, HeaderValue::from_static(ALLOW_SPA));
            response
        }
    })
}

/// Go's `path.Clean`: one slash between elements, no `.` element, each inner `..` removed with
/// the element before it, a `..` at the start of a rooted path dropped, and `.` for nothing.
fn clean(path: &str) -> String {
    let rooted = path.starts_with('/');
    let mut elements: Vec<&str> = Vec::new();
    for element in path.split('/') {
        match element {
            "" | "." => {}
            ".." => {
                if elements.last().is_some_and(|last| *last != "..") {
                    elements.pop();
                } else if !rooted {
                    elements.push("..");
                }
            }
            other => elements.push(other),
        }
    }
    let joined = elements.join("/");
    if rooted {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".to_owned()
    } else {
        joined
    }
}

/// Go's `fs.ValidPath`: `.`, or relative elements none of which is empty, `.` or `..`.
fn valid_path(name: &str) -> bool {
    name == "."
        || name
            .split('/')
            .all(|element| !element.is_empty() && element != "." && element != "..")
}

fn collect(dir: &Dir<'static>, files: &mut Files) {
    for entry in dir.entries() {
        match entry {
            DirEntry::Dir(dir) => collect(dir, files),
            DirEntry::File(file) => {
                if let Some(path) = file.path().to_str() {
                    files.insert(path.to_owned(), Bytes::from_static(file.contents()));
                }
            }
        }
    }
}

/// Go's `html.EscapeString`.
fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '\'' => escaped.push_str("&#39;"),
            '"' => escaped.push_str("&#34;"),
            other => escaped.push(other),
        }
    }
    escaped
}

/// `bytes.ReplaceAll`.
fn replace_bytes(haystack: &[u8], from: &[u8], to: &[u8]) -> Vec<u8> {
    let mut replaced = Vec::with_capacity(haystack.len());
    let mut rest = haystack;
    while let Some(at) = rest.windows(from.len()).position(|window| window == from) {
        replaced.extend_from_slice(&rest[..at]);
        replaced.extend_from_slice(to);
        rest = &rest[at + from.len()..];
    }
    replaced.extend_from_slice(rest);
    replaced
}
