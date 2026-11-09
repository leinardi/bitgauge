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

//! The third-party images of the harness topology, each pinned by digest so a run means the same
//! thing tomorrow. Dependabot cannot see pins in source, so they are refreshed by hand in each
//! health audit. The tools image
//! is not here: it is built from `test/harness/tools.Dockerfile`, whose own base is pinned.

/// The browsers of exactly the `@playwright/test` version `web/package.json` pins; the client
/// runs the harness driver from the mounted workspace inside it.
pub const PLAYWRIGHT_IMAGE: &str = "mcr.microsoft.com/playwright:v1.64.1-noble\
    @sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
/// The HTTP/1.1 proxy, also the one whose second entry point refuses WebSocket upgrades.
pub const TRAEFIK_IMAGE: &str = "docker.io/library/traefik:v3.7.14\
    @sha256:575fa15b135078fe5e50aa847987d96dbddd7b093c172429618404df73f3fa7c";
/// The HTTP/2 proxy, on its internal CA.
pub const CADDY_IMAGE: &str = "docker.io/library/caddy:2.11.7-alpine\
    @sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f";
/// The `OpenSpeedTest` UI the compatibility step drives with `?Host=` on a Compat profile
/// (testing.md section 5); it is run as published, never copied or shipped.
pub const OPEN_SPEED_TEST_IMAGE: &str = "docker.io/openspeedtest/latest:v2.0.6\
    @sha256:a6a7e3b3e9e93cfe7b9b2eb49c60b2a93644149a0a600845d4df57148b193ff6";

/// The pinned third-party images.
#[must_use]
pub const fn images() -> [&'static str; 4] {
    [
        PLAYWRIGHT_IMAGE,
        TRAEFIK_IMAGE,
        CADDY_IMAGE,
        OPEN_SPEED_TEST_IMAGE,
    ]
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use regex::Regex;

    use super::*;

    /// Go: `TestImagesArePinned`. The third-party images are pinned by digest, and the Playwright
    /// image to the browsers of the `@playwright/test` version the workspace installs.
    #[test]
    fn images_are_pinned() {
        let pinned = Regex::new(r"^[a-z0-9.\-/]+:[A-Za-z0-9._\-]+@sha256:[0-9a-f]{64}$")
            .expect("the pin pattern");
        let unpinned: Vec<&str> = images()
            .into_iter()
            .filter(|image| !pinned.is_match(image))
            .collect();
        assert!(
            unpinned.is_empty(),
            "not pinned by tag and digest: {unpinned:?}"
        );

        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("../web/package.json");
        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&manifest).expect("web/package.json"))
                .expect("web/package.json parses");
        let version = manifest["devDependencies"]["@playwright/test"]
            .as_str()
            .expect("the @playwright/test pin");
        assert!(
            PLAYWRIGHT_IMAGE.starts_with(&format!("mcr.microsoft.com/playwright:v{version}-")),
            "the Playwright image {PLAYWRIGHT_IMAGE} is not the @playwright/test {version} the \
             workspace installs"
        );
    }
}
