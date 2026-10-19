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

package harness

// The third-party images of the harness topology, each pinned by digest so a run means the same
// thing tomorrow. Dependabot cannot see pins in Go source, so they are refreshed by hand in each
// health audit. The tools image is not here: it is built from test/harness/tools.Dockerfile, whose
// own base is pinned (netguard.BuildToolsImage).
const (
	// PlaywrightImage carries the browsers of exactly the @playwright/test version web/package.json
	// pins; the client runs the harness driver from the mounted workspace inside it.
	PlaywrightImage = "mcr.microsoft.com/playwright:v1.64.0-noble" +
		"@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f"
	// TraefikImage is the HTTP/1.1 proxy, also the one whose second entry point refuses
	// WebSocket upgrades.
	TraefikImage = "docker.io/library/traefik:v3.7.14" +
		"@sha256:575fa15b135078fe5e50aa847987d96dbddd7b093c172429618404df73f3fa7c"
	// CaddyImage is the HTTP/2 proxy, on its internal CA.
	CaddyImage = "docker.io/library/caddy:2.11.7-alpine" +
		"@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f"
	// OpenSpeedTestImage is the OpenSpeedTest UI the compatibility step drives with ?Host= on a
	// Compat profile (testing.md section 5); it is run as published, never copied or shipped.
	OpenSpeedTestImage = "docker.io/openspeedtest/latest:v2.0.6" +
		"@sha256:a6a7e3b3e9e93cfe7b9b2eb49c60b2a93644149a0a600845d4df57148b193ff6"
)

// Images lists the pinned third-party images.
func Images() []string {
	return []string{PlaywrightImage, TraefikImage, CaddyImage, OpenSpeedTestImage}
}
