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

//! The SPA's tests.

use std::convert::Infallible;
use std::future::ready;
use std::sync::Arc;

use axum::Router;
use bytes::Bytes;
use http::header::{
    ACCEPT_RANGES, ALLOW, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, IF_MATCH,
    IF_NONE_MATCH,
};
use http::{Method, Request, Response, StatusCode};
use tower_service::Service as _;

use super::files::{RangeError, Ranges, parse_range};
use super::{Files, ROOT_ASSETS, Spa, not_found};
use crate::handlers::Body;
use crate::handlers::tests::support::{body_bytes, header};

/// `index.html` as the web build writes it: relative asset URLs, the root assets' links by bare
/// name, and the meta element with the root base path.
const TEMPLATE: &str = r#"<!doctype html><html><head>
<meta name="bitgauge-base-path" content="/" />
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="site.webmanifest" />
<script type="module" crossorigin src="./assets/index-a1.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-b2.css">
</head><body><div id="app"></div></body></html>"#;

const MANIFEST: &str =
    r#"{"id":"./","start_url":"./","scope":"./","icons":[{"src":"icon-192.png"}]}"#;

/// The script asset, ten bytes, for the range tests.
const SCRIPT: &str = "export {};";

fn dist() -> Files {
    let mut files = Files::new();
    for (name, content) in [
        (".gitkeep", ""),
        ("index.html", TEMPLATE),
        ("assets/index-a1.js", SCRIPT),
        ("assets/index-b2.css", "body{}"),
        ("assets/fonts/x.txt", "nested"),
        ("assets/font-c3.woff2", "woff2"),
        ("assets/data-d4.bin7", "unknown"),
    ] {
        files.insert(name.to_owned(), Bytes::from_static(content.as_bytes()));
    }
    for (name, _) in ROOT_ASSETS {
        files.insert(name.to_owned(), Bytes::from(format!("bytes of {name}")));
    }
    files.insert(
        "site.webmanifest".to_owned(),
        Bytes::from_static(MANIFEST.as_bytes()),
    );
    files
}

/// The SPA rendered for `base_path` and mounted there as the router mounts it, with the plain
/// 404 for anything else.
fn server(files: Files, base_path: &str) -> Router {
    let spa = Arc::new(Spa::render_files(files, base_path).expect("a complete dist"));
    let base = base_path.strip_suffix('/').unwrap_or(base_path);
    spa.routes(base).fallback(|| ready(not_found()))
}

async fn call(router: &Router, request: Request<Body>) -> Response<Body> {
    let mut router = router.clone();
    let answer: Result<_, Infallible> = router.call(request).await;
    answer.expect("an answer")
}

fn request(method: Method, path: &str, headers: &[(&str, &str)]) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(path);
    for &(name, value) in headers {
        builder = builder.header(name, value);
    }
    builder.body(Body::empty()).expect("a request")
}

async fn get(router: &Router, path: &str) -> Response<Body> {
    call(router, request(Method::GET, path, &[])).await
}

async fn text(response: Response<Body>) -> String {
    String::from_utf8(body_bytes(response).await.to_vec()).expect("a text body")
}

/// Go: `TestRenderWritesTheBasePath`.
#[tokio::test]
async fn render_writes_the_base_path() {
    for (base_path, prefix, meta) in [
        ("/", "/", "/"),
        ("/speed", "/speed/", "/speed"),
        ("/speed/", "/speed/", "/speed"),
    ] {
        let body = text(get(&server(dist(), base_path), prefix).await).await;
        for want in [
            format!(r#"<meta name="bitgauge-base-path" content="{meta}""#),
            format!(r#"href="{prefix}favicon.svg""#),
            format!(r#"href="{prefix}site.webmanifest""#),
            format!(r#"src="{prefix}assets/index-a1.js""#),
            format!(r#"href="{prefix}assets/index-b2.css""#),
        ] {
            assert!(
                body.contains(&want),
                "base path {base_path}: index.html lacks {want}:\n{body}"
            );
        }
        assert!(
            !body.contains(r#""./"#),
            "base path {base_path}: a relative URL is left:\n{body}"
        );
    }
}

/// The base path is written escaped, as Go's `html.EscapeString` writes it.
#[test]
fn render_escapes_the_base_path() {
    let spa = Spa::render_files(dist(), "/a&b").expect("a complete dist");
    let index = String::from_utf8(spa.index.to_vec()).expect("a text index");
    assert!(index.contains(r#"content="/a&amp;b""#), "{index}");
    assert!(
        index.contains(r#"src="/a&amp;b/assets/index-a1.js""#),
        "{index}"
    );
}

/// Go: `TestRoutesServeTheFixedListOnly`.
#[tokio::test]
async fn routes_serve_the_fixed_list_only() {
    let router = server(dist(), "/speed");
    for path in [
        "/speed",
        "/speed/",
        "/speed/result/0b6f",
        "/speed/history",
        "/speed/settings",
        "/speed/about",
    ] {
        let response = get(&router, path).await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(header(&response, "cache-control"), "no-cache", "{path}");
        assert_eq!(
            header(&response, "content-type"),
            "text/html; charset=utf-8",
            "{path}"
        );
        assert!(
            text(response).await.contains(r#"content="/speed""#),
            "{path}"
        );
    }
    for path in [
        "/speed/unknown",
        "/unknown",
        "/speed/result/",
        "/speed/index.html",
        "/speed/assets/",
        "/speed/assets/missing.js",
        "/speed/assets/fonts",
        "/speed/assets/../index.html",
        "/speed/.gitkeep",
        "/favicon.svg",
    ] {
        let response = get(&router, path).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
        assert_eq!(text(response).await, "404 page not found\n", "{path}");
    }
}

/// Go: `TestAssetsAreImmutable`, with the content types of the fixed table: Go's built-in
/// types, the font types the build ships, and `application/octet-stream` for any other
/// extension (`docs/rust-port.md` row 12).
#[tokio::test]
async fn assets_are_immutable() {
    let router = server(dist(), "/");
    for (path, content_type) in [
        ("/assets/index-a1.js", "text/javascript; charset=utf-8"),
        ("/assets/index-b2.css", "text/css; charset=utf-8"),
        ("/assets/fonts/x.txt", "text/plain; charset=utf-8"),
        ("/assets/font-c3.woff2", "font/woff2"),
        ("/assets/data-d4.bin7", "application/octet-stream"),
    ] {
        let response = get(&router, path).await;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(
            header(&response, "cache-control"),
            "public, max-age=31536000, immutable",
            "{path}"
        );
        assert_eq!(header(&response, "content-type"), content_type, "{path}");
        assert_eq!(header(&response, "accept-ranges"), "bytes", "{path}");
    }
}

/// An asset name is cleaned as Go's `path.Clean` cleans it, and one that leaves `assets/` is
/// 404, as a go1.26 run of the Go SPA answers each path.
#[tokio::test]
async fn asset_names_are_cleaned_as_go_cleans_them() {
    let router = server(dist(), "/");
    for (path, status) in [
        ("/assets/fonts//x.txt", StatusCode::OK),
        ("/assets/./index-a1.js", StatusCode::OK),
        ("/assets/fonts/../index-a1.js", StatusCode::OK),
        ("/assets//index-a1.js", StatusCode::OK),
        ("/assets/index-a1.js/", StatusCode::OK),
        ("/assets/../index.html", StatusCode::NOT_FOUND),
        ("/assets/..", StatusCode::NOT_FOUND),
        ("/assets/fonts/../../index.html", StatusCode::NOT_FOUND),
        ("/assets/.", StatusCode::NOT_FOUND),
        ("/assets/fonts", StatusCode::NOT_FOUND),
        ("/assets/fonts/", StatusCode::NOT_FOUND),
        ("/assets/%2E%2E/index.html", StatusCode::NOT_FOUND),
        ("/assets/index%2Da1.js", StatusCode::NOT_FOUND),
    ] {
        assert_eq!(get(&router, path).await.status(), status, "{path}");
    }
}

/// Go's `path.Clean` on the forms a request path can reach.
#[test]
fn clean_is_go_path_clean() {
    for (path, want) in [
        ("", "."),
        (".", "."),
        ("..", ".."),
        ("../a", "../a"),
        ("a/../../b", "../b"),
        ("/a/../..", "/"),
        ("/../a", "/a"),
        ("a//b/./c/", "a/b/c"),
        ("a/b/..", "a"),
    ] {
        assert_eq!(super::clean(path), want, "{path:?}");
    }
}

/// Go: `TestRootAssetsUnderTheBasePath`.
#[tokio::test]
async fn root_assets_under_the_base_path() {
    for (base_path, prefix) in [("/", "/"), ("/speed", "/speed/")] {
        let router = server(dist(), base_path);
        for (name, content_type) in ROOT_ASSETS {
            let response = get(&router, &format!("{prefix}{name}")).await;
            assert_eq!(response.status(), StatusCode::OK, "{prefix}{name}");
            assert_eq!(
                header(&response, "content-type"),
                content_type,
                "{prefix}{name}"
            );
            assert_eq!(
                header(&response, "cache-control"),
                "public, max-age=86400",
                "{prefix}{name}"
            );
        }
    }
    // Without the base path, a root asset under /speed/ is just an unknown path.
    let response = get(&server(dist(), "/"), "/speed/favicon.svg").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Go: `TestManifestIsServedUnchanged`: its `./` start URL and scope resolve against the
/// manifest's own URL, under the base path.
#[tokio::test]
async fn manifest_is_served_unchanged() {
    let response = get(&server(dist(), "/speed"), "/speed/site.webmanifest").await;
    assert_eq!(text(response).await, MANIFEST);
}

/// Go: `TestRenderFailsOnAnIncompleteDist`.
#[test]
fn render_fails_on_an_incomplete_dist() {
    let mut without_icon = dist();
    without_icon.remove("icon-512.png");
    let mut without_meta = dist();
    without_meta.insert(
        "index.html".to_owned(),
        Bytes::from_static(b"<html></html>"),
    );
    let mut two_metas = dist();
    two_metas.insert(
        "index.html".to_owned(),
        Bytes::from(format!("{TEMPLATE}{TEMPLATE}")),
    );
    let clean_checkout = Files::from([(".gitkeep".to_owned(), Bytes::new())]);
    for (name, files, want) in [
        (
            "a clean checkout",
            clean_checkout,
            "the embedded SPA is incomplete; build it with make build: index.html",
        ),
        ("a root asset", without_icon, "icon-512.png is missing"),
        (
            "no meta element",
            without_meta,
            "0 bitgauge-base-path meta elements, want 1",
        ),
        (
            "two meta elements",
            two_metas,
            "2 bitgauge-base-path meta elements, want 1",
        ),
    ] {
        let error = Spa::render_files(files, "/").expect_err(name);
        assert!(
            error.to_string().contains(want),
            "{name}: {error}, want {want}"
        );
    }
}

/// `HEAD` on every SPA route answers as `GET` without the body (`docs/rust-port.md` row 12).
#[tokio::test]
async fn head_on_spa_routes_has_the_get_headers_and_no_body() {
    let router = server(dist(), "/speed");
    for path in [
        "/speed/",
        "/speed/history",
        "/speed/assets/index-a1.js",
        "/speed/favicon.svg",
    ] {
        let got = get(&router, path).await;
        let head = call(&router, request(Method::HEAD, path, &[])).await;
        assert_eq!(head.status(), StatusCode::OK, "{path}");
        for name in [CONTENT_TYPE, CACHE_CONTROL] {
            assert_eq!(
                head.headers().get(&name),
                got.headers().get(&name),
                "{path}: {name}"
            );
        }
        assert!(body_bytes(head).await.is_empty(), "{path}");
    }
}

/// Any other method on an SPA route is a plain 405 with its Allow and no body.
#[tokio::test]
async fn other_methods_on_spa_routes_are_405() {
    let router = server(dist(), "/");
    for method in [Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS] {
        for path in [
            "/",
            "/result/abc",
            "/assets/index-a1.js",
            "/site.webmanifest",
        ] {
            let response = call(&router, request(method.clone(), path, &[])).await;
            assert_eq!(
                response.status(),
                StatusCode::METHOD_NOT_ALLOWED,
                "{method} {path}"
            );
            assert_eq!(response.headers()[ALLOW], "GET, HEAD", "{method} {path}");
            assert!(body_bytes(response).await.is_empty(), "{method} {path}");
        }
    }
}

async fn ranged(range: &str, more: &[(&str, &str)]) -> Response<Body> {
    let mut headers = vec![("range", range)];
    headers.extend_from_slice(more);
    call(
        &server(dist(), "/"),
        request(Method::GET, "/assets/index-a1.js", &headers),
    )
    .await
}

/// A single range is 206 with its `Content-Range`, as `http.ServeContent` answers it.
#[tokio::test]
async fn a_single_range_is_206() {
    for (range, content_range, body) in [
        ("bytes=0-3", "bytes 0-3/10", "expo"),
        ("bytes=7-", "bytes 7-9/10", "{};"),
        ("bytes=-2", "bytes 8-9/10", "};"),
        ("bytes=8-100", "bytes 8-9/10", "};"),
        ("bytes=-100", "bytes 0-9/10", SCRIPT),
        ("bytes=12-20, 1-1", "bytes 1-1/10", "x"),
    ] {
        let response = ranged(range, &[]).await;
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT, "{range}");
        assert_eq!(response.headers()[CONTENT_RANGE], content_range, "{range}");
        assert_eq!(response.headers()[ACCEPT_RANGES], "bytes", "{range}");
        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "text/javascript; charset=utf-8",
            "{range}"
        );
        assert_eq!(text(response).await, body, "{range}");
    }
}

/// A range past the end is 416 with the size, and a malformed one 416 without it. Neither has
/// `Cache-Control`: Go's `ServeContent` drops the caching headers from its errors.
#[tokio::test]
async fn an_unsatisfiable_range_is_416() {
    for (range, content_range, body) in [
        (
            "bytes=10-",
            Some("bytes */10"),
            "invalid range: failed to overlap\n",
        ),
        (
            "bytes=20-30, 11-",
            Some("bytes */10"),
            "invalid range: failed to overlap\n",
        ),
        ("bytes=3-1", None, "invalid range\n"),
        ("bytes=x-1", None, "invalid range\n"),
        ("bytes=-", None, "invalid range\n"),
        ("items=0-1", None, "invalid range\n"),
    ] {
        let response = ranged(range, &[]).await;
        assert_eq!(
            response.status(),
            StatusCode::RANGE_NOT_SATISFIABLE,
            "{range}"
        );
        assert_eq!(
            response
                .headers()
                .get(CONTENT_RANGE)
                .map(|value| value.to_str().expect("text")),
            content_range,
            "{range}"
        );
        assert!(!response.headers().contains_key(CACHE_CONTROL), "{range}");
        assert_eq!(text(response).await, body, "{range}");
    }
}

/// An empty `If-Range` is no header, as Go's `Header.Get` reads it, so the range still counts.
#[tokio::test]
async fn an_empty_if_range_keeps_the_range() {
    let response = ranged("bytes=0-1", &[("if-range", "")]).await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(text(response).await, "ex");
}

/// Several ranges answer the whole file with 200 (`docs/rust-port.md` row 12), as does a range
/// under an `If-Range`, which never matches a file without an `ETag` or a modification time.
#[tokio::test]
async fn several_ranges_or_an_if_range_answer_the_whole_file() {
    for (range, more) in [
        ("bytes=0-1, 4-5", &[][..]),
        ("bytes=0-1", &[("if-range", "\"tag\"")][..]),
        ("", &[][..]),
    ] {
        let response = ranged(range, more).await;
        assert_eq!(response.status(), StatusCode::OK, "{range} {more:?}");
        assert!(response.headers().get(CONTENT_RANGE).is_none(), "{range}");
        assert_eq!(response.headers()[CONTENT_LENGTH], "10", "{range}");
        assert_eq!(text(response).await, SCRIPT, "{range}");
    }
}

/// The conditional headers that can decide for a file without an `ETag`: `If-None-Match: *`
/// is 304, and `If-Match` without `*` is 412, as a go1.26 `http.ServeContent` run answers.
#[tokio::test]
async fn conditional_requests() {
    let router = server(dist(), "/");
    for (name, value, status) in [
        (IF_NONE_MATCH, "*", StatusCode::NOT_MODIFIED),
        (IF_NONE_MATCH, "\"tag\"", StatusCode::OK),
        (IF_MATCH, "\"tag\"", StatusCode::PRECONDITION_FAILED),
        (IF_MATCH, "*", StatusCode::OK),
        // Go's `Header.Get` reads an empty value as no header.
        (IF_MATCH, "", StatusCode::OK),
    ] {
        let response = call(
            &router,
            request(
                Method::GET,
                "/assets/index-a1.js",
                &[(name.as_str(), value)],
            ),
        )
        .await;
        assert_eq!(response.status(), status, "{name}: {value}");
        let served = status == StatusCode::OK;
        assert_eq!(
            response.headers().contains_key(CONTENT_TYPE),
            served,
            "{name}: {value}"
        );
    }
}

/// An empty file ignores a range that cannot overlap it, and an empty suffix of it ends at -1,
/// as `http.ServeContent` answers both (a go1.26 run).
#[tokio::test]
async fn ranges_of_an_empty_file() {
    let mut files = dist();
    files.insert("assets/empty-e5.js".to_owned(), Bytes::new());
    let router = server(files, "/");
    for (range, status, content_range) in [
        ("bytes=0-", StatusCode::OK, None),
        ("bytes=3-1", StatusCode::OK, None),
        ("bytes=0-0,2-2", StatusCode::OK, None),
        (
            "bytes=-2",
            StatusCode::PARTIAL_CONTENT,
            Some("bytes 0--1/0"),
        ),
        ("bytes=x-1", StatusCode::RANGE_NOT_SATISFIABLE, None),
    ] {
        let response = call(
            &router,
            request(Method::GET, "/assets/empty-e5.js", &[("range", range)]),
        )
        .await;
        assert_eq!(response.status(), status, "{range}");
        assert_eq!(
            response
                .headers()
                .get(CONTENT_RANGE)
                .map(|value| value.to_str().expect("text")),
            content_range,
            "{range}"
        );
    }
    let response = ranged("bytes=-0", &[]).await;
    assert_eq!(response.headers()[CONTENT_RANGE], "bytes 10-9/10");
}

/// Go's `parseRange` on the forms the range tests do not reach through a request; the
/// expectations are those of a go1.26 `http.ServeContent` run.
#[test]
fn parse_range_reads_go_forms() {
    for (header, size, want) in [
        ("", 10, Ok(Ranges::None)),
        ("bytes=", 10, Ok(Ranges::None)),
        (
            "bytes= 2-3 ,",
            10,
            Ok(Ranges::One {
                start: 2,
                length: 2,
            }),
        ),
        (
            "bytes=+2-3",
            10,
            Ok(Ranges::One {
                start: 2,
                length: 2,
            }),
        ),
        (
            "bytes=-0",
            10,
            Ok(Ranges::One {
                start: 10,
                length: 0,
            }),
        ),
        ("bytes=0-0,2-2", 10, Ok(Ranges::Several)),
        ("bytes=0-", 0, Err(RangeError::NoOverlap)),
        ("bytes=--1", 10, Err(RangeError::Invalid)),
        ("bytes=1", 10, Err(RangeError::Invalid)),
        ("bytes=-1-", 10, Err(RangeError::Invalid)),
    ] {
        assert_eq!(parse_range(header, size), want, "{header:?} of {size}");
    }
}
