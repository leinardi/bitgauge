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
	"fmt"
	"strconv"
	"strings"
)

// The client container's own cgroup v2 files, as its private cgroup namespace shows them.
const (
	cgroupCPUStat    = "/sys/fs/cgroup/cpu.stat"
	cgroupMemoryPeak = "/sys/fs/cgroup/memory.peak"
)

const usecPerSecond = 1e6

var errCgroup = errors.New("unreadable cgroup counters")

// Usage is the client's CPU and memory over one browser run (testing.md section 5's CPU and memory
// counters): the browser and Playwright, everything in the client container. The client only
// sleeps before the run, so its lifetime memory peak is the run's.
type Usage struct {
	// CPUSeconds is user plus system CPU time, summed over all cores.
	CPUSeconds float64 `json:"cpuSeconds"`
	// WallSeconds is the run's duration, so CPUSeconds / WallSeconds is the mean cores busy.
	WallSeconds     float64 `json:"wallSeconds"`
	PeakMemoryBytes uint64  `json:"peakMemoryBytes"`
}

// cpuUsageMicros reads usage_usec from a cgroup v2 cpu.stat.
func cpuUsageMicros(cpuStat string) (uint64, error) {
	for line := range strings.SplitSeq(cpuStat, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), " ")
		if !found || key != "usage_usec" {
			continue
		}

		usec, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%w: usage_usec %q: %w", errCgroup, value, err)
		}

		return usec, nil
	}

	return 0, fmt.Errorf("%w: cpu.stat has no usage_usec", errCgroup)
}

// memoryPeak reads a cgroup v2 memory.peak (Linux 5.19 or later).
func memoryPeak(content string) (uint64, error) {
	peak, err := strconv.ParseUint(strings.TrimSpace(content), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: memory.peak %q: %w", errCgroup, strings.TrimSpace(content), err)
	}

	return peak, nil
}
