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
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The fixtures are the clients' outputs as the CI tier's Caddy profile produced them.
const (
	libreSpeedOutput = `[{"timestamp":"2026-10-19T13:51:07.708319658Z","server":{"name":"BitGauge",` +
		`"url":"https://proxy:8443/"},"client":{"ip":"","hostname":"","city":"","region":"",` +
		`"country":"","loc":"","org":"","postal":"","timezone":""},"bytes_sent":117831559,` +
		`"bytes_received":116149467,"ping":50.3,"jitter":0.02,"upload":91.4,"download":93.5,` +
		`"share":""}]`
	goResponsivenessOutput = `10-19-2026 13:51:12 UTC Go Responsiveness to proxy:8443...
Results:
========
Download:
	Note: Test did not run to stability (throughput), these results are estimates.
	Throughput: 92.863 Mbps (11.608 MBps), using 16 parallel connections.
	RPM: 288 (P90)
	RPM: 1039 (Single-Sided 5% Trimmed Mean)
========
Upload:
	Throughput: 90.258 Mbps (11.282 MBps), using 16 parallel connections.
	RPM: 577 (P90)
	RPM: 1801 (Single-Sided 5% Trimmed Mean)
========
Final RPM: 307 (P90)
Final RPM: 1377 (Single-Sided 5% Trimmed Mean)
`
	openSpeedTestOutput = `{"status": "All done", "downloadMbps": "93.4", "uploadMbps": "91.2"}`
)

var errExit = errors.New("exit status 1")

// writeFixtures writes the three clients' files into a fresh directory, each replaced by its entry
// in override when there is one; a nil entry leaves the file out.
func writeFixtures(t *testing.T, override map[string]*string) string {
	t.Helper()

	dir := t.TempDir()

	err := WriteLibreSpeed(dir, libreSpeedOutput, nil)
	if err != nil {
		t.Fatal(err)
	}

	err = WriteGoResponsiveness(dir, goResponsivenessOutput, nil)
	if err != nil {
		t.Fatal(err)
	}

	err = writeCompatFile(dir, OpenSpeedTestFile, []byte(openSpeedTestOutput))
	if err != nil {
		t.Fatal(err)
	}

	for name, content := range override {
		path := filepath.Join(dir, name)
		if content == nil {
			err = os.Remove(path)
		} else {
			err = os.WriteFile(path, []byte(*content), fileMode)
		}

		if err != nil {
			t.Fatal(err)
		}
	}

	return dir
}

func TestReadCompat(t *testing.T) {
	t.Parallel()

	compat, err := ReadCompat(writeFixtures(t, nil), true)
	if err != nil {
		t.Fatal(err)
	}

	want := Compat{
		LibreSpeed: &CompatClient{DownloadBitsPerSecond: 93.5e6, UploadBitsPerSecond: 91.4e6},
		GoResponsiveness: &CompatClient{
			DownloadBitsPerSecond: 92.863e6,
			UploadBitsPerSecond:   90.258e6,
			RPM:                   307,
			Estimate:              true,
		},
		OpenSpeedTest: &CompatClient{DownloadBitsPerSecond: 93.4e6, UploadBitsPerSecond: 91.2e6},
	}

	for name, pair := range map[string][2]*CompatClient{
		"librespeed":       {compat.LibreSpeed, want.LibreSpeed},
		"goresponsiveness": {compat.GoResponsiveness, want.GoResponsiveness},
		"openspeedtest":    {compat.OpenSpeedTest, want.OpenSpeedTest},
	} {
		got, wanted := pair[0], pair[1]
		if got == nil || !closeTo(got.DownloadBitsPerSecond, wanted.DownloadBitsPerSecond) ||
			!closeTo(
				got.UploadBitsPerSecond,
				wanted.UploadBitsPerSecond,
			) || got.RPM != wanted.RPM ||
			got.Estimate != wanted.Estimate {
			t.Errorf("%s = %+v, want %+v", name, got, wanted)
		}
	}

	// Outside Chromium the OpenSpeedTest UI does not run, and its file is not read.
	compat, err = ReadCompat(writeFixtures(t, map[string]*string{OpenSpeedTestFile: nil}), false)
	if err != nil || compat.OpenSpeedTest != nil {
		t.Errorf("without the OpenSpeedTest UI: %+v, %v", compat, err)
	}
}

// TestReadCompatFailures walks every failure mode of the step on fixture outputs: each fails the
// profile, and none is a skip.
func TestReadCompatFailures(t *testing.T) {
	t.Parallel()

	text := func(value string) *string { return &value }

	for _, tc := range []struct {
		name     string
		override map[string]*string
		want     string
		kept     func(*Compat) bool
	}{
		{
			"librespeed missing",
			map[string]*string{LibreSpeedFile: nil},
			"librespeed.json: the client's output is unusable: missing", nil,
		},
		{
			"goresponsiveness missing",
			map[string]*string{GoResponsivenessFile: nil},
			"goresponsiveness.json: the client's output is unusable: missing", nil,
		},
		{
			"openspeedtest missing",
			map[string]*string{OpenSpeedTestFile: nil},
			"openspeedtest.json: the client's output is unusable: missing", nil,
		},
		{
			"librespeed empty",
			map[string]*string{LibreSpeedFile: text(" \n")},
			"librespeed.json: the client's output is unusable: empty", nil,
		},
		{
			"openspeedtest empty",
			map[string]*string{OpenSpeedTestFile: text("")},
			"openspeedtest.json: the client's output is unusable: empty", nil,
		},
		{
			"librespeed not JSON",
			map[string]*string{LibreSpeedFile: text("Error: no server")},
			"librespeed.json: the client's output is unusable: invalid character", nil,
		},
		{
			"librespeed no result",
			map[string]*string{LibreSpeedFile: text("[]")},
			"librespeed.json: the client's output is unusable: 0 results", nil,
		},
		{
			"librespeed without upload",
			map[string]*string{LibreSpeedFile: text(`[{"download":93.5}]`)},
			"librespeed.json: the client's output is unusable: 1 results", nil,
		},
		{
			"goresponsiveness not JSON",
			map[string]*string{GoResponsivenessFile: text("{")},
			"goresponsiveness.json: the client's output is unusable", nil,
		},
		{
			"openspeedtest not a number",
			map[string]*string{OpenSpeedTestFile: text(`{"status":"All done","downloadMbps":"","uploadMbps":"91.2"}`)},
			"openspeedtest.json: the client's output is unusable: strconv.ParseFloat", nil,
		},
		{
			"openspeedtest network error",
			map[string]*string{OpenSpeedTestFile: text(`{"status":"Check your network connection status.","downloadMbps":"0","uploadMbps":"0"}`)},
			`openspeedtest.json: the client failed: the UI ended on "Check your network connection status."`, nil,
		},
		{
			"librespeed zero download",
			map[string]*string{LibreSpeedFile: text(`[{"download":0,"upload":91.4}]`)},
			"librespeed.json: the client reported no throughput: zero download",
			func(c *Compat) bool { return c.LibreSpeed != nil && c.LibreSpeed.UploadBitsPerSecond == 91.4e6 },
		},
		{
			"openspeedtest zero upload",
			map[string]*string{OpenSpeedTestFile: text(`{"status":"All done","downloadMbps":"93.4","uploadMbps":"0.000"}`)},
			"openspeedtest.json: the client reported no throughput: zero upload", nil,
		},
		{
			"goresponsiveness zero RPM",
			map[string]*string{GoResponsivenessFile: text(`{"downloadBitsPerSecond":9e7,"uploadBitsPerSecond":9e7,"rpm":0}`)},
			"goresponsiveness.json: the client reported no throughput: zero RPM", nil,
		},
	} {
		compat, err := ReadCompat(writeFixtures(t, tc.override), true)
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: %v, want %q", tc.name, err, tc.want)
		}

		if tc.kept != nil && !tc.kept(compat) {
			t.Errorf("%s: the numbers were not kept: %+v", tc.name, compat)
		}
	}
}

// TestWriteCompatFailures: a non-zero exit fails the client and writes no file the read could
// mistake for a result; a goresponsiveness summary without its lines writes no JSON.
func TestWriteCompatFailures(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	err := WriteLibreSpeed(dir, libreSpeedOutput, errExit)
	if !errors.Is(err, errClientFailed) || !errors.Is(err, errExit) {
		t.Errorf("librespeed-cli's non-zero exit: %v", err)
	}

	err = WriteGoResponsiveness(dir, goResponsivenessOutput, errExit)
	if !errors.Is(err, errClientFailed) {
		t.Errorf("goresponsiveness's non-zero exit: %v", err)
	}

	kept, err := os.ReadFile(filepath.Join(dir, goResponsivenessLog))
	if err != nil || string(kept) != errExit.Error()+"\n" {
		t.Errorf("goresponsiveness's failure kept %q, %v; want its error", kept, err)
	}

	_, err = ReadCompat(dir, false)
	if err == nil ||
		!strings.Contains(
			err.Error(),
			"librespeed.json: the client's output is unusable: missing",
		) ||
		!strings.Contains(
			err.Error(),
			"goresponsiveness.json: the client's output is unusable: missing",
		) {
		t.Errorf("after both exits failed: %v", err)
	}

	for name, output := range map[string]string{
		"no upload":    strings.Replace(goResponsivenessOutput, "Upload:", "Uplink:", 1),
		"no final RPM": strings.ReplaceAll(goResponsivenessOutput, "Final RPM", "Last RPM"),
		"empty":        "",
	} {
		dir := t.TempDir()

		err = WriteGoResponsiveness(dir, output, nil)
		if !errors.Is(err, errClientOutput) {
			t.Errorf("goresponsiveness %s: %v", name, err)
		}

		_, statErr := os.Stat(filepath.Join(dir, GoResponsivenessFile))
		if !errors.Is(statErr, os.ErrNotExist) {
			t.Errorf("goresponsiveness %s wrote its JSON: %v", name, statErr)
		}

		_, logErr := os.Stat(filepath.Join(dir, goResponsivenessLog))
		if logErr != nil {
			t.Errorf("goresponsiveness %s kept no output: %v", name, logErr)
		}
	}
}

func closeTo(got, want float64) bool {
	return got > want*(1-1e-9) && got < want*(1+1e-9)
}
