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
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
)

// ethernetFrame is a full frame as tbf counts it: a 1500-byte MTU plus the 14-byte Ethernet
// header. tcpPayload is what TCP carries in it, with timestamps on: 1500 - 20 (IP) - 32 (TCP).
const (
	ethernetFrame = 1514
	tcpPayload    = 1448
)

// tbf's burst is 10 ms of data, at least two full Ethernet frames: eight bits a byte, a hundred
// 10 ms slices a second.
const (
	burstDivisor = 8 * 100
	minimumBurst = 2 * ethernetFrame
)

var errIperf3Output = errors.New("unreadable iperf3 output")

// ExpectedGoodput is the TCP payload rate a correct shaper lets through at a profile's rate: tbf
// counts whole frames, iperf3 counts payload, and full frames carry tcpPayload of ethernetFrame
// bytes. The self-test holds iperf3 to this, not to the configured rate.
func ExpectedGoodput(rateBitsPerSecond int64) float64 {
	return float64(rateBitsPerSecond) * tcpPayload / ethernetFrame
}

// ShaperCommands are the tc and ip commands that shape a profile's link on the client's eth0:
// delay and rate, without loss. The self-test runs on this link; LossCommand adds the loss after,
// since TCP over a lossy link cannot show whether the rate holds.
func ShaperCommands(profile *Profile) []string {
	rate := strconv.FormatInt(profile.RateBitsPerSecond, 10) + "bit"
	// Burst: 10 ms of data, at least two full frames; the queue holds 400 ms.
	burst := strconv.FormatInt(max(profile.RateBitsPerSecond/burstDivisor, minimumBurst), 10)
	tbf := "tbf rate " + rate + " burst " + burst + " latency 400ms"

	return []string{
		"tc qdisc add dev eth0 root handle 1: " + netemDelay(profile),
		"tc qdisc add dev eth0 parent 1: handle 2: " + tbf,
		"ip link add ifb0 type ifb",
		"ip link set ifb0 up",
		"tc qdisc add dev eth0 handle ffff: ingress",
		"tc filter add dev eth0 parent ffff: protocol all u32 match u32 0 0 action mirred egress redirect dev ifb0",
		"tc qdisc add dev ifb0 root " + tbf,
	}
}

// LossCommand changes the root netem qdisc to add the profile's loss, or is empty when it has none.
func LossCommand(profile *Profile) string {
	if profile.LossPercent <= 0 {
		return ""
	}

	return "tc qdisc change dev eth0 root handle 1: " + netemDelay(profile) +
		" loss " + strconv.FormatFloat(profile.LossPercent, 'f', -1, 64) + "%"
}

func netemDelay(profile *Profile) string {
	return "netem delay " + strconv.FormatInt(profile.RTT.Milliseconds(), 10) + "ms"
}

// receivedBitsPerSecond reads the receiver's throughput from iperf3 --json output: the client's
// in --reverse mode, the server's otherwise.
func receivedBitsPerSecond(out string) (float64, error) {
	var report struct {
		End struct {
			SumReceived struct {
				BitsPerSecond float64 `json:"bits_per_second"` //nolint:tagliatelle // iperf3's own key.
			} `json:"sum_received"` //nolint:tagliatelle // iperf3's own key.
		} `json:"end"`
	}

	err := json.Unmarshal([]byte(out), &report)
	if err != nil {
		return 0, fmt.Errorf("%w: %w", errIperf3Output, err)
	}

	if report.End.SumReceived.BitsPerSecond <= 0 {
		return 0, fmt.Errorf("%w: no received throughput", errIperf3Output)
	}

	return report.End.SumReceived.BitsPerSecond, nil
}
