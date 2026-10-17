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

package config

import (
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/leinardi/bitgauge/internal/logger"
)

// Problem is one key that broke one rule. A configuration problem is logged as one line with
// these three attributes (configuration-security.md section 2); a warning has the same shape.
type Problem struct {
	Key   string
	Value string
	Rule  string
}

// The ranges of configuration.md section 2.
const (
	minPort                = 1
	maxPort                = 65535
	minDisplayNameRunes    = 1
	maxDisplayNameRunes    = 64
	minTransferCap         = 64 * KiB
	maxTransferCap         = 4 * GiB
	minStreamsPerClient    = 1
	maxStreamsPerClient    = 64
	minRequestsPerMinute   = 60
	maxRequestsPerMinute   = 100000
	minTrackedClients      = 16
	maxTrackedClients      = 1000000
	minNQUploadBytes       = 1 * MiB
	maxNQUploadBytes       = 64 * GiB
	minNQFlowsPerClient    = 1
	maxNQFlowsPerClient    = 256
	minStreams             = 1
	maxStreams             = 6
	minPhaseDuration       = 5 * time.Second
	maxPhaseDuration       = 10 * time.Minute
	minDataCap             = 1 * MiB
	minFixedWarmup         = 1 * time.Second
	maxFixedWarmup         = 60 * time.Second
	minPingCount           = 6
	maxPingCount           = 200
	maxOverheadPercent     = 20
	baseRoot               = "/"
	pathSegmentCurrent     = "."
	pathSegmentParent      = ".."
	schemeHTTP             = "http"
	schemeHTTPS            = "https"
	presetQuick            = "quick"
	presetStandard         = "standard"
	presetExtended         = "extended"
	presetContinuous       = "continuous"
	milestoneCompatibility = "v0.3"
)

// Validate checks a decoded configuration against every rule of configuration.md section 4
// that this release can decide, and returns every problem, not only the first. The one rule
// it leaves out is the metrics.path route collision, which needs the router's own route list
// (configuration-security.md section 2) and is checked where the router is built; here
// metrics.path is checked for its shape only.
func Validate(cfg *Config) []Problem {
	var check checker

	check.server(&cfg.Server)
	check.limits(cfg.Limits)
	check.testDefaults(&cfg.TestDefaults, cfg.Limits)
	check.compat(cfg.Compat)
	check.log(cfg.Log)
	check.metrics(cfg.Metrics)

	return check.problems
}

// Check returns every problem of a load: the keys that did not decode, then the validation
// problems of the rest. A key that did not decode kept its default, so validation does not
// report it again.
func Check(loaded *Loaded) []Problem {
	problems := slices.Clone(loaded.Problems)

	for _, problem := range Validate(&loaded.Config) {
		if !coveredBy(problem.Key, loaded.Problems) {
			problems = append(problems, problem)
		}
	}

	return problems
}

// coveredBy reports whether key already has a decode problem: the same key, a parent of it, or,
// for a list element that failed, the list itself, since the element left a zero value behind.
func coveredBy(key string, decodeProblems []Problem) bool {
	for _, problem := range decodeProblems {
		failed := problem.Key
		if key == failed || strings.HasPrefix(key, failed+keyDelimiter) ||
			strings.HasPrefix(key, failed+"[") {
			return true
		}

		list, _, isElement := strings.Cut(failed, "[")
		if isElement && key == list {
			return true
		}
	}

	return false
}

type checker struct {
	problems []Problem
}

func (c *checker) add(key string, value any, rule string) {
	c.problems = append(c.problems, Problem{Key: key, Value: fmt.Sprint(value), Rule: rule})
}

func (c *checker) intRange(key string, value, low, high int) {
	if value < low || value > high {
		c.add(key, value, fmt.Sprintf("must be between %d and %d", low, high))
	}
}

func (c *checker) sizeRange(key string, value, low, high Size) {
	if value < low || value > high {
		c.add(
			key,
			value,
			fmt.Sprintf(
				"must be between %s and %s (%d to %d bytes)",
				low,
				high,
				int64(low),
				int64(high),
			),
		)
	}
}

func (c *checker) oneOf(key, value string, allowed ...string) {
	if !slices.Contains(allowed, value) {
		c.add(key, value, "must be one of "+strings.Join(allowed, ", "))
	}
}

func (c *checker) server(server *Server) {
	if server.Listen.Port < minPort || server.Listen.Port > maxPort {
		c.add(
			"server.listen",
			server.Listen.String(),
			fmt.Sprintf("must be host:port with a port from %d to %d", minPort, maxPort),
		)
	}

	c.basePath("server.base_path", server.BasePath)

	nameLength := utf8.RuneCountInString(server.DisplayName)
	if nameLength < minDisplayNameRunes || nameLength > maxDisplayNameRunes ||
		!isPrintable(server.DisplayName) {
		c.add(
			"server.display_name",
			server.DisplayName,
			fmt.Sprintf(
				"must be %d to %d printable characters",
				minDisplayNameRunes,
				maxDisplayNameRunes,
			),
		)
	}

	if server.PublicURL != "" {
		c.origin("server.public_url", server.PublicURL)
	}

	for index, origin := range server.CORS.AllowedOrigins {
		c.origin(fmt.Sprintf("server.cors.allowed_origins[%d]", index), origin)
	}
}

// basePath applies the base path shape rule; metrics.path shares it.
func (c *checker) basePath(key, path string) {
	const rule = "must start with /, have no trailing / (except / itself), no . or .. segment, " +
		"no query or fragment, and only A-Z a-z 0-9 - . _ ~ /"

	if !strings.HasPrefix(path, baseRoot) ||
		(path != baseRoot && strings.HasSuffix(path, baseRoot)) {
		c.add(key, path, rule)

		return
	}

	for _, char := range path {
		if !isPathChar(char) {
			c.add(key, path, rule)

			return
		}
	}

	for segment := range strings.SplitSeq(path, baseRoot) {
		if segment == pathSegmentCurrent || segment == pathSegmentParent {
			c.add(key, path, rule)

			return
		}
	}
}

func isPathChar(char rune) bool {
	return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') ||
		(char >= '0' && char <= '9') ||
		strings.ContainsRune("-._~/", char)
}

func isPrintable(text string) bool {
	for _, char := range text {
		if !unicode.IsPrint(char) {
			return false
		}
	}

	return true
}

// origin requires an absolute http or https origin: scheme, host and optional port, nothing
// else. "*" is not an origin and is rejected like any other non-origin.
func (c *checker) origin(key string, origin Origin) {
	const rule = "must be an http or https origin (scheme, host and optional port) with no path, " +
		"query, fragment or user information; * is not allowed"

	parsed, err := url.Parse(string(origin))
	if err != nil || (parsed.Scheme != schemeHTTP && parsed.Scheme != schemeHTTPS) ||
		parsed.Host == "" ||
		parsed.Hostname() == "" ||
		parsed.Opaque != "" ||
		parsed.User != nil ||
		parsed.Path != "" ||
		parsed.RawQuery != "" ||
		parsed.ForceQuery ||
		parsed.Fragment != "" ||
		strings.HasSuffix(string(origin), "#") {
		c.add(key, origin, rule)
	}
}

func (c *checker) limits(limits Limits) {
	c.sizeRange(
		"limits.max_download_bytes",
		limits.MaxDownloadBytes,
		minTransferCap,
		maxTransferCap,
	)
	c.sizeRange("limits.max_upload_bytes", limits.MaxUploadBytes, minTransferCap, maxTransferCap)
	c.intRange(
		"limits.max_streams_per_client",
		limits.MaxStreamsPerClient,
		minStreamsPerClient,
		maxStreamsPerClient,
	)
	c.intRange(
		"limits.requests_per_minute",
		limits.RequestsPerMinute,
		minRequestsPerMinute,
		maxRequestsPerMinute,
	)
	c.intRange(
		"limits.tracked_clients",
		limits.TrackedClients,
		minTrackedClients,
		maxTrackedClients,
	)
}

func (c *checker) testDefaults(defaults *TestDefaults, limits Limits) {
	c.oneOf(
		"test_defaults.preset",
		defaults.Preset,
		presetQuick,
		presetStandard,
		presetExtended,
		presetContinuous,
	)

	if defaults.Preset == presetContinuous {
		c.add(
			"test_defaults.preset",
			defaults.Preset,
			notInRelease("the Continuous preset", milestoneCompatibility),
		)
	}

	c.phases(defaults.Phases)
	c.streams(defaults.Streams, limits)

	// The ranges hold whatever the preset; an unknown preset only leaves an empty bound without
	// a value to compare against.
	preset, known := Preset(defaults.Preset)
	c.durations("test_defaults.download", defaults.Download, preset.Download, known)
	c.durations("test_defaults.upload", defaults.Upload, preset.Upload, known)

	if defaults.DataCap != 0 && defaults.DataCap < minDataCap {
		c.add(
			"test_defaults.data_cap",
			defaults.DataCap,
			fmt.Sprintf("must be 0 (no cap) or at least %s", minDataCap),
		)
	}

	c.oneOf("test_defaults.units", defaults.Units, "bits", "bytes")

	if !defaults.Warmup.Auto &&
		(defaults.Warmup.Duration < minFixedWarmup || defaults.Warmup.Duration > maxFixedWarmup) {
		c.add(
			"test_defaults.warmup",
			defaults.Warmup.Duration,
			fmt.Sprintf("must be auto or a duration from %s to %s", minFixedWarmup, maxFixedWarmup),
		)
	}

	if defaults.PingCount != 0 &&
		(defaults.PingCount < minPingCount || defaults.PingCount > maxPingCount) {
		c.add("test_defaults.ping_count", defaults.PingCount,
			fmt.Sprintf("must be 0 (the preset's value) or %d to %d", minPingCount, maxPingCount))
	}

	percent := defaults.OverheadCompensationPercent
	if percent < 0 || percent > maxOverheadPercent {
		c.add(
			"test_defaults.overhead_compensation_percent",
			percent,
			fmt.Sprintf("must be between 0 and %d", maxOverheadPercent),
		)
	}
}

// phases: non-empty, known names, no duplicates, idle first when present.
func (c *checker) phases(phases []string) {
	const key = "test_defaults.phases"

	value := "[" + strings.Join(phases, ", ") + "]"

	switch {
	case len(phases) == 0:
		c.add(key, value, "must list at least one of idle, download, upload")
	case slices.ContainsFunc(phases, func(phase string) bool {
		return phase != defaultPhaseIdle && phase != defaultPhaseDownload && phase != defaultPhaseUpload
	}):
		c.add(key, value, "may only list idle, download and upload")
	case len(slices.Compact(slices.Sorted(slices.Values(phases)))) != len(phases):
		c.add(key, value, "must not list a phase twice")
	case slices.Contains(phases, defaultPhaseIdle) && phases[0] != defaultPhaseIdle:
		c.add(key, value, "must list idle first when it is present")
	default:
	}
}

func (c *checker) streams(streams Streams, limits Limits) {
	c.oneOf("test_defaults.streams.mode", streams.Mode, "auto", "fixed", "single")
	c.intRange("test_defaults.streams.max", streams.Max, minStreams, maxStreams)

	if streams.Max > limits.MaxStreamsPerClient {
		c.add(
			"test_defaults.streams.max",
			streams.Max,
			fmt.Sprintf(
				"must not exceed limits.max_streams_per_client (%d)",
				limits.MaxStreamsPerClient,
			),
		)
	}

	if streams.Fixed < minStreams || streams.Fixed > streams.Max {
		c.add(
			"test_defaults.streams.fixed",
			streams.Fixed,
			fmt.Sprintf(
				"must be between %d and test_defaults.streams.max (%d)",
				minStreams,
				streams.Max,
			),
		)
	}
}

// durations checks one direction's bounds, an unset bound standing for the preset's value when
// the preset is known. A pair violation is reported on the bound the operator wrote: the maximum
// when it is set, the minimum otherwise.
func (c *checker) durations(
	key string,
	bounds DurationRange,
	preset [2]time.Duration,
	presetKnown bool,
) {
	minKey, maxKey := key+".min_duration", key+".max_duration"
	minimum, maximum := preset[0], preset[1]

	if bounds.MinDuration.Set {
		minimum = bounds.MinDuration.Duration
		if minimum < minPhaseDuration || minimum > maxPhaseDuration {
			c.add(
				minKey,
				minimum,
				fmt.Sprintf("must be from %s to %s", minPhaseDuration, maxPhaseDuration),
			)
		}
	}

	if bounds.MaxDuration.Set {
		maximum = bounds.MaxDuration.Duration
		if maximum > maxPhaseDuration {
			c.add(maxKey, maximum, fmt.Sprintf("must be at most %s", maxPhaseDuration))
		}
	}

	bothSet := bounds.MinDuration.Set && bounds.MaxDuration.Set
	oneSetWithPreset := (bounds.MinDuration.Set || bounds.MaxDuration.Set) && presetKnown

	if (!bothSet && !oneSetWithPreset) || minimum <= maximum {
		return
	}

	if bounds.MaxDuration.Set {
		c.add(maxKey, maximum, fmt.Sprintf(
			"must not be below min_duration (%s; an empty bound is the preset's value)", minimum))

		return
	}

	c.add(minKey, minimum, fmt.Sprintf(
		"must not exceed max_duration (%s, the preset's value since it is empty)", maximum))
}

func (c *checker) compat(compat Compat) {
	toggles := []struct {
		key     string
		enabled bool
		name    string
	}{
		{
			"compat.openspeedtest.enabled",
			compat.OpenSpeedTest.Enabled,
			"the OpenSpeedTest compatibility layer",
		},
		{
			"compat.librespeed.enabled",
			compat.LibreSpeed.Enabled,
			"the LibreSpeed compatibility layer",
		},
		{
			"compat.networkquality.enabled",
			compat.NetworkQuality.Enabled,
			"the networkQuality compatibility layer",
		},
	}

	for _, toggle := range toggles {
		if toggle.enabled {
			c.add(toggle.key, toggle.enabled, notInRelease(toggle.name, milestoneCompatibility))
		}
	}

	c.sizeRange(
		"compat.networkquality.max_upload_bytes",
		compat.NetworkQuality.MaxUploadBytes,
		minNQUploadBytes,
		maxNQUploadBytes,
	)
	c.intRange(
		"compat.networkquality.max_flows_per_client",
		compat.NetworkQuality.MaxFlowsPerClient,
		minNQFlowsPerClient,
		maxNQFlowsPerClient,
	)
}

func (c *checker) log(log Log) {
	c.oneOf("log.format", log.Format, logger.FormatText, logger.FormatJSON)
	c.oneOf(
		"log.level",
		log.Level,
		logger.LevelDebug,
		logger.LevelInfo,
		logger.LevelWarn,
		logger.LevelError,
	)
}

func (c *checker) metrics(metrics Metrics) {
	c.basePath("metrics.path", metrics.Path)
}

// notInRelease is the rule for a toggle of a feature this release does not include
// (configuration.md section 4, "Features not in this release").
func notInRelease(feature, milestone string) string {
	return fmt.Sprintf(
		"%s arrives in %s and is not in this release; remove the setting",
		feature,
		milestone,
	)
}
