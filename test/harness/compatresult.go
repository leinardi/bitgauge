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
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// The outputs of the compatibility step (testing.md section 5), one file per client in the run's
// compatibility directory (Artifacts.Compat). The step itself runs under the harness tag
// (compat.go); writing and reading the files is plain Go, unit-tested on fixture outputs. Each
// client passes when it exits without an error and reports a non-zero download and upload, and
// goresponsiveness an RPM; anything else, a missing or unreadable file included, fails the
// profile and is never a skip.
const (
	LibreSpeedFile       = "librespeed.json"
	GoResponsivenessFile = "goresponsiveness.json"
	OpenSpeedTestFile    = "openspeedtest.json"
	// goResponsivenessLog keeps goresponsiveness's own output, which its JSON is read from.
	goResponsivenessLog = "goresponsiveness.txt"
)

// openSpeedTestDone is the status line the OpenSpeedTest UI ends a completed test on.
const openSpeedTestDone = "All done"

var (
	errClientFailed  = errors.New("the client failed")
	errClientOutput  = errors.New("the client's output is unusable")
	errClientNumbers = errors.New("the client reported no throughput")
)

var (
	// goResponsivenessThroughput is the throughput line goresponsiveness prints under each
	// direction's heading, in Mbit/s.
	goResponsivenessThroughput = regexp.MustCompile(`^\s+Throughput: ([0-9.]+) Mbps \(`)
	// goResponsivenessRPM is its final RPM, at the percentile it names.
	goResponsivenessRPM = regexp.MustCompile(`^Final RPM: (\d+) \(P\d+\)$`)
)

// CompatClient is one compatibility client's numbers. They follow the client's own method
// (compatibility.md), so they are recorded, not held to the tolerance table.
type CompatClient struct {
	DownloadBitsPerSecond float64 `json:"downloadBitsPerSecond"`
	UploadBitsPerSecond   float64 `json:"uploadBitsPerSecond"`
	// RPM is goresponsiveness's final RPM at its percentile; zero for the other clients.
	RPM float64 `json:"rpm,omitempty"`
	// Estimate is goresponsiveness's note that a direction did not run to stability.
	Estimate bool `json:"estimate,omitempty"`
}

// Compat is what the compatibility step recorded of one run: each client that produced its numbers.
// OpenSpeedTest runs in Chromium only, so it is nil on the other browsers' runs.
type Compat struct {
	LibreSpeed       *CompatClient `json:"librespeed,omitempty"`
	GoResponsiveness *CompatClient `json:"goresponsiveness,omitempty"`
	OpenSpeedTest    *CompatClient `json:"openspeedtest,omitempty"`
}

// WriteLibreSpeed keeps librespeed-cli's JSON output as librespeed.json; a non-zero exit fails
// the client and writes nothing.
func WriteLibreSpeed(dir, output string, runErr error) error {
	if runErr != nil {
		return fmt.Errorf("librespeed-cli: %w: %w", errClientFailed, runErr)
	}

	return writeCompatFile(dir, LibreSpeedFile, []byte(output))
}

// WriteGoResponsiveness keeps goresponsiveness's output and writes goresponsiveness.json from it.
// goresponsiveness has no JSON output, and its Prometheus file holds the last direction only, so
// the JSON is read from the summary it prints: each direction's throughput line and the final
// RPM. A non-zero exit fails the client, keeps the error (with the client's standard error) in
// place of the output, which the docker CLI does not return then, and writes no JSON; an output
// without the three lines writes none either, which ReadCompat reports as a missing file.
func WriteGoResponsiveness(dir, output string, runErr error) error {
	kept := output
	if runErr != nil {
		kept = runErr.Error() + "\n"
	}

	err := writeCompatFile(dir, goResponsivenessLog, []byte(kept))
	if err != nil {
		return err
	}

	if runErr != nil {
		return fmt.Errorf("goresponsiveness: %w: %w", errClientFailed, runErr)
	}

	client, err := parseGoResponsiveness(output)
	if err != nil {
		return fmt.Errorf("goresponsiveness: %w", err)
	}

	encoded, err := json.MarshalIndent(client, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", GoResponsivenessFile, err)
	}

	return writeCompatFile(dir, GoResponsivenessFile, append(encoded, '\n'))
}

// parseGoResponsiveness reads the summary goresponsiveness prints: a "Download:" and an "Upload:"
// heading, each followed by its indented throughput line, and the final RPM line.
func parseGoResponsiveness(output string) (*CompatClient, error) {
	client := &CompatClient{}
	seen := map[string]bool{}
	heading := ""

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case line == "Download:" || line == "Upload:":
			heading = strings.TrimSuffix(line, ":")
		case strings.Contains(line, "did not run to stability"):
			client.Estimate = true
		case goResponsivenessThroughput.MatchString(line) && heading != "":
			mbps, err := strconv.ParseFloat(
				goResponsivenessThroughput.FindStringSubmatch(line)[1],
				64,
			)
			if err != nil {
				return nil, fmt.Errorf("%w: %q: %w", errClientOutput, line, err)
			}

			if heading == "Download" {
				client.DownloadBitsPerSecond = mbps * mbit
			} else {
				client.UploadBitsPerSecond = mbps * mbit
			}

			seen[heading] = true
			heading = ""
		case goResponsivenessRPM.MatchString(line) && !seen["RPM"]:
			rpm, err := strconv.ParseFloat(goResponsivenessRPM.FindStringSubmatch(line)[1], 64)
			if err != nil {
				return nil, fmt.Errorf("%w: %q: %w", errClientOutput, line, err)
			}

			client.RPM = rpm
			seen["RPM"] = true
		}
	}

	for _, want := range []string{"Download", "Upload", "RPM"} {
		if !seen[want] {
			return nil, fmt.Errorf("%w: no %s line in the summary", errClientOutput, want)
		}
	}

	return client, nil
}

// ReadCompat reads the step's files from dir: librespeed.json and goresponsiveness.json, and
// openspeedtest.json when the run drove the OpenSpeedTest UI. It returns every client it could
// read, with an error joining each failure: a missing or empty file, a parse failure, an
// OpenSpeedTest run that did not complete, or a zero download, upload or RPM.
func ReadCompat(dir string, openSpeedTest bool) (*Compat, error) {
	compat := &Compat{}

	librespeed, libreErr := readCompatClient(dir, LibreSpeedFile, parseLibreSpeed)
	compat.LibreSpeed = librespeed

	goResponsiveness, goErr := readCompatClient(
		dir,
		GoResponsivenessFile,
		parseGoResponsivenessJSON,
	)
	compat.GoResponsiveness = goResponsiveness

	var openErr error

	if openSpeedTest {
		compat.OpenSpeedTest, openErr = readCompatClient(dir, OpenSpeedTestFile, parseOpenSpeedTest)
	}

	return compat, errors.Join(libreErr, goErr, openErr)
}

// readCompatClient reads one file and checks the numbers: a client that reports them is kept
// even when they fail the check, so the report shows what it measured.
func readCompatClient(
	dir, name string,
	parse func([]byte) (*CompatClient, error),
) (*CompatClient, error) {
	data, err := os.ReadFile(filepath.Join(dir, name))

	switch {
	case errors.Is(err, fs.ErrNotExist):
		return nil, fmt.Errorf("%s: %w: missing", name, errClientOutput)
	case err != nil:
		return nil, fmt.Errorf("%s: %w", name, err)
	case strings.TrimSpace(string(data)) == "":
		return nil, fmt.Errorf("%s: %w: empty", name, errClientOutput)
	}

	client, err := parse(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}

	var zero []string

	if client.DownloadBitsPerSecond <= 0 {
		zero = append(zero, "download")
	}

	if client.UploadBitsPerSecond <= 0 {
		zero = append(zero, "upload")
	}

	if name == GoResponsivenessFile && client.RPM <= 0 {
		zero = append(zero, "RPM")
	}

	if len(zero) > 0 {
		return client, fmt.Errorf(
			"%s: %w: zero %s",
			name,
			errClientNumbers,
			strings.Join(zero, ", "),
		)
	}

	return client, nil
}

// parseLibreSpeed reads librespeed-cli's --json output: one result per server tested, of which
// --server 1 makes exactly one, with its download and upload in Mbit/s.
func parseLibreSpeed(data []byte) (*CompatClient, error) {
	var results []struct {
		Download *float64 `json:"download"`
		Upload   *float64 `json:"upload"`
	}

	err := json.Unmarshal(data, &results)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errClientOutput, err)
	}

	if len(results) != 1 || results[0].Download == nil || results[0].Upload == nil {
		return nil, fmt.Errorf(
			"%w: %d results, want one with its download and upload",
			errClientOutput,
			len(results),
		)
	}

	return &CompatClient{
		DownloadBitsPerSecond: *results[0].Download * mbit,
		UploadBitsPerSecond:   *results[0].Upload * mbit,
	}, nil
}

// parseGoResponsivenessJSON reads the goresponsiveness.json WriteGoResponsiveness wrote.
func parseGoResponsivenessJSON(data []byte) (*CompatClient, error) {
	var client CompatClient

	err := json.Unmarshal(data, &client)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errClientOutput, err)
	}

	return &client, nil
}

// parseOpenSpeedTest reads what the OpenSpeedTest driver recorded: the status line the UI ended
// on and the download and upload it shows, in Mbit/s.
func parseOpenSpeedTest(data []byte) (*CompatClient, error) {
	var shown struct {
		Status       string `json:"status"`
		DownloadMbps string `json:"downloadMbps"`
		UploadMbps   string `json:"uploadMbps"`
	}

	err := json.Unmarshal(data, &shown)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errClientOutput, err)
	}

	if shown.Status != openSpeedTestDone {
		return nil, fmt.Errorf("%w: the UI ended on %q", errClientFailed, shown.Status)
	}

	download, downloadErr := strconv.ParseFloat(strings.TrimSpace(shown.DownloadMbps), 64)
	upload, uploadErr := strconv.ParseFloat(strings.TrimSpace(shown.UploadMbps), 64)

	err = errors.Join(downloadErr, uploadErr)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errClientOutput, err)
	}

	return &CompatClient{
		DownloadBitsPerSecond: download * mbit,
		UploadBitsPerSecond:   upload * mbit,
	}, nil
}

func writeCompatFile(dir, name string, data []byte) error {
	err := os.MkdirAll(dir, dirMode)
	if err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	err = os.WriteFile(filepath.Join(dir, name), data, fileMode)
	if err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}

	return nil
}
