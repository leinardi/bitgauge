//go:build harness

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

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	// compatLimit bounds each compatibility client; each runs well under a minute.
	compatLimit = 3 * time.Minute
	// caddyRootCA is where Caddy keeps the root of its internal CA, in the official image's data
	// directory.
	caddyRootCA = "/data/caddy/pki/authorities/local/root.crt"
	// trustStore is the bundle Go's crypto/x509 reads first on Alpine, which both clients use.
	trustStore = "/etc/ssl/certs/ca-certificates.crt"
)

// Compat is the compatibility step of a Compat profile (testing.md section 5), after the browser
// run: librespeed-cli and goresponsiveness in the tools container that shares the client's
// namespace, on the browser's path through the proxy, then, in Chromium only, the OpenSpeedTest UI
// driven by openspeedtest.spec.ts. Each client's output goes into the run's Artifacts.Compat and
// ReadCompat reads them back; any failure is returned with whatever was recorded.
func (t *Topology) Compat(ctx context.Context, browser string) (*Compat, error) {
	relativeDir := ArtifactsFor(t.profile.Name, browser).Compat
	dir := filepath.Join(t.cfg.OutDir, relativeDir)

	// A re-run writes into the same directory: an earlier attempt's files must not stand in for a
	// client that failed this time.
	err := os.RemoveAll(dir)
	if err != nil {
		return nil, fmt.Errorf("clear %s: %w", relativeDir, err)
	}

	libreCtx, cancel := context.WithTimeout(ctx, compatLimit)
	out, runErr := t.exec(libreCtx, t.shaper, "librespeed-cli", "--no-icmp",
		"--server-json", t.URL+"/.well-known/librespeed", "--server", "1", "--json")

	cancel()

	libreErr := WriteLibreSpeed(dir, out, runErr)

	goCtx, cancel := context.WithTimeout(ctx, compatLimit)
	out, runErr = t.exec(goCtx, t.shaper, "goresponsiveness", "--url", t.URL+"/nq/config")

	cancel()

	goErr := WriteGoResponsiveness(dir, out, runErr)

	openSpeedTest := browser == BrowserChromium

	var openErr error

	if openSpeedTest {
		openErr = t.playwright(ctx, "harness/openspeedtest.spec.ts", BrowserChromium,
			"HARNESS_OPENSPEEDTEST_URL="+t.openSpeedTestURL(),
			"HARNESS_EXPORT_DIR="+clientOut+"/"+filepath.ToSlash(relativeDir),
			"HARNESS_OUTPUT_DIR="+clientOut+"/playwright/"+t.profile.Name+"-openspeedtest")
		if openErr != nil {
			openErr = fmt.Errorf("the OpenSpeedTest UI run: %w", openErr)
		}
	}

	compat, readErr := ReadCompat(dir, openSpeedTest)

	return compat, errors.Join(libreErr, goErr, openErr, readErr)
}

// trustProxyCA installs Caddy's internal root into the shaper's trust store, where both
// compatibility clients read it, so they verify the proxy's certificate instead of skipping the
// check. The root travels in the environment of the one command that appends it.
func (t *Topology) trustProxyCA(ctx context.Context) error {
	if !t.profile.Compat {
		return nil
	}

	root, err := t.exec(ctx, t.proxy, "cat", caddyRootCA)
	if err != nil {
		return fmt.Errorf("read Caddy's root CA: %w", err)
	}

	_, err = t.env.Docker(ctx, "exec", "--env", "CADDY_ROOT="+root, t.shaper,
		"sh", "-c", `printf '%s\n' "$CADDY_ROOT" >> `+trustStore)
	if err != nil {
		return fmt.Errorf("install Caddy's root CA in the shaper: %w", err)
	}

	return nil
}
