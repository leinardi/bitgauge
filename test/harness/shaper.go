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
	"slices"
	"strconv"
	"strings"
	"time"
)

// ethernetFrame is a full frame as tbf counts it: a 1500-byte MTU plus the 14-byte Ethernet
// header. tcpPayload is what TCP carries in it, with timestamps on: 1500 - 20 (IP) - 32 (TCP).
const (
	ethernetFrame = 1514
	tcpPayload    = 1448
)

// tbf's burst is 10 ms of data, at least two full Ethernet frames: eight bits a byte, a hundred
// 10 ms slices a second. Its queue is 80 ms of data, at least 64 KiB: eight bits a byte, 12.5
// slices of 80 ms a second.
const (
	burstDivisor = 8 * 100
	minimumBurst = 2 * ethernetFrame
	queueDivisor = 8 * 1000 / 80
	minimumQueue = 64 * 1024

	bitsPerByte           = 8
	millisecondsPerSecond = 1000
)

var (
	errIperf3Output = errors.New("unreadable iperf3 output")
	errTbfOutput    = errors.New("unreadable tc output")
)

// tbfQdisc starts the tc -s line of the tbf ShaperCommands adds on each device, handle 2:.
const tbfQdisc = "qdisc tbf 2:"

// TbfSentBytes reads the bytes the tbf has sent from tc -s qdisc show output: the "Sent N bytes"
// line under the tbf, which counts whole frames, the unit tbf meters the rate in.
func TbfSentBytes(out string) (int64, error) {
	lines := strings.Split(out, "\n")
	for i, line := range lines {
		if !strings.HasPrefix(line, tbfQdisc) || i+1 == len(lines) {
			continue
		}

		fields := strings.Fields(lines[i+1])
		if len(fields) < 3 || fields[0] != "Sent" || fields[2] != "bytes" {
			return 0, fmt.Errorf("%w: no Sent line under %q", errTbfOutput, tbfQdisc)
		}

		sent, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%w: %w", errTbfOutput, err)
		}

		return sent, nil
	}

	return 0, fmt.Errorf("%w: no %q", errTbfOutput, tbfQdisc)
}

const (
	// defaultIperf3Length is iperf3's own TCP block length, 128 KiB.
	defaultIperf3Length = 128 * 1024
	minimumSettle       = 2 * time.Second
	settleRoundTrips    = 10
	// fullInterval leaves out the short last interval iperf3 may report as a test ends.
	fullInterval = 0.5
	// intervalSlack absorbs iperf3's float interval starts.
	intervalSlack = 1e-6
)

// ExpectedGoodput is the TCP payload rate a correct shaper lets through at a profile's rate: tbf
// counts whole frames, iperf3 counts payload, and full frames carry tcpPayload of ethernetFrame
// bytes. The reference runs are held to this; the self-test reads the tbf itself, against the
// configured rate.
func ExpectedGoodput(rateBitsPerSecond int64) float64 {
	return float64(rateBitsPerSecond) * tcpPayload / ethernetFrame
}

// ConfiguredGoodput is the reference runs' baseline (testing.md section 5): ExpectedGoodput less
// the share a lossy profile's loss spends on retransmissions, which iperf3 does not count.
func ConfiguredGoodput(profile *Profile) float64 {
	return ExpectedGoodput(profile.RateBitsPerSecond) * (1 - profile.LossPercent/percent)
}

// OffloadCommand caps segmentation offload on eth0 at one segment per packet (testing.md section
// 5.1). The qdiscs see a sender's packets before segmentation, and a two-segment packet takes one
// of fq_codel's slots sized for one frame: at 300 kbit/s, 600 ms the 64 KiB queue held 133 KB, and
// the round trip grew to 3.3 s instead of the 2.35 s the queue allows.
const OffloadCommand = "ip link set dev eth0 gso_max_segs 1"

// CapsOffload reports whether a profile's link runs OffloadCommand: only where the queue is its
// 64 KiB minimum, more than 80 ms of data. There CoDel's interval is seconds long and the packet
// limit is what holds the queue; above it, CoDel holds the queue near its 80 ms target within
// 160 ms whatever the packets carry, and one segment per packet costs more CPU than the Docker
// bridge has: the 1 Gbit self-test fell to 780-858 Mbit/s against 956.
func CapsOffload(profile *Profile) bool {
	return profile.RateBitsPerSecond/queueDivisor < minimumQueue
}

// ShaperCommands are the tc and ip commands that shape a profile's link on the client's eth0:
// delay and rate, without loss. The self-test runs on this link; LossCommand adds the loss after,
// since TCP over a lossy link cannot show whether the rate holds.
//
// Each direction is a tbf at the profile's rate whose queue, the one of measurement.md section 19
// (80 ms of data, at least 64 KiB), is an fq_codel shared among the flows crossing it, as section
// 19.1 models the link: one drop-tail FIFO would let an established stream hold the whole queue
// and lock a newly opened one out for seconds, which measures TCP's fairness and not BitGauge.
// CoDel's target is the queue's own length, so it drops nothing early and a single flow still
// fills the link; a full queue drops from the flow holding most of it.
//
// fq_codel's limit counts packets, sized as full frames, so where CapsOffload holds, the first
// command is OffloadCommand; the namespace that sends to the client runs it too
// (Topology.capSenderOffload).
func ShaperCommands(profile *Profile) []string {
	rate := strconv.FormatInt(profile.RateBitsPerSecond, 10) + "bit"
	burst := strconv.FormatInt(max(profile.RateBitsPerSecond/burstDivisor, minimumBurst), 10)
	queue := max(profile.RateBitsPerSecond/queueDivisor, minimumQueue)
	tbf := "tbf rate " + rate + " burst " + burst + " limit " + strconv.FormatInt(queue, 10)
	// The queue's length in time, rounded up to a whole millisecond.
	queueMs := (queue*bitsPerByte*millisecondsPerSecond + profile.RateBitsPerSecond - 1) / profile.RateBitsPerSecond
	fqCodel := "fq_codel limit " + strconv.FormatInt((queue+ethernetFrame-1)/ethernetFrame, 10) +
		" target " + strconv.FormatInt(queueMs, 10) + "ms interval " + strconv.FormatInt(2*queueMs, 10) + "ms"

	commands := []string{
		"tc qdisc add dev eth0 root handle 1: " + netemDelay(profile),
		"tc qdisc add dev eth0 parent 1: handle 2: " + tbf,
		"tc qdisc add dev eth0 parent 2:1 handle 3: " + fqCodel,
		"ip link add ifb0 type ifb",
		"ip link set ifb0 up",
		"tc qdisc add dev eth0 handle ffff: ingress",
		"tc filter add dev eth0 parent ffff: protocol all u32 match u32 0 0 action mirred egress redirect dev ifb0",
		"tc qdisc add dev ifb0 root handle 2: " + tbf,
		"tc qdisc add dev ifb0 parent 2:1 handle 3: " + fqCodel,
	}
	if CapsOffload(profile) {
		commands = append([]string{OffloadCommand}, commands...)
	}

	return commands
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

// iperf3Interval is one of iperf3's one-second interval reports, as --json writes it.
type iperf3Interval struct {
	Sum struct {
		Start         float64 `json:"start"`
		Seconds       float64 `json:"seconds"`
		BitsPerSecond float64 `json:"bits_per_second"` //nolint:tagliatelle // iperf3's own key.
	} `json:"sum"`
}

// Iperf3Settle is how long an iperf3 measurement runs before its intervals count: TCP's ramp and,
// over a long round trip, its first loss recoveries, ten round trips and at least 2 s.
func Iperf3Settle(rtt time.Duration) time.Duration {
	return max(minimumSettle, settleRoundTrips*rtt)
}

// Iperf3Length is iperf3's block length at a profile's rate, in bytes: 10 ms of data, between one
// full segment's payload and iperf3's default. iperf3 reads whole blocks, so a block of more than
// a second's data at a slow rate would quantize every interval's count; an unshaped profile, with
// no rate, keeps the default.
func Iperf3Length(rateBitsPerSecond int64) int64 {
	if rateBitsPerSecond <= 0 {
		return defaultIperf3Length
	}

	return min(max(rateBitsPerSecond/burstDivisor, tcpPayload), defaultIperf3Length)
}

// receivedBitsPerSecond reads the receiver's steady goodput from iperf3 --json output: the median
// of its full one-second intervals from settle on, the client's in --reverse mode, the server's
// (--get-server-output from a --json server) otherwise. iperf3's own totals are not used: --omit
// carries the omitted seconds' bytes into them, and at a slow rate over a long round trip a loss
// recovery holds a second's bytes back and hands them over in the next, which a mean over a few
// seconds turns into a rate the link never had.
func receivedBitsPerSecond(out string, reverse bool, settle time.Duration) (float64, error) {
	var report struct {
		Intervals    []iperf3Interval `json:"intervals"`
		ServerOutput *struct {
			Intervals []iperf3Interval `json:"intervals"`
		} `json:"server_output_json"` //nolint:tagliatelle // iperf3's own key.
	}

	err := json.Unmarshal([]byte(out), &report)
	if err != nil {
		return 0, fmt.Errorf("%w: %w", errIperf3Output, err)
	}

	intervals := report.Intervals
	if !reverse {
		if report.ServerOutput == nil {
			return 0, fmt.Errorf("%w: no server intervals", errIperf3Output)
		}

		intervals = report.ServerOutput.Intervals
	}

	var rates []float64

	for _, interval := range intervals {
		if interval.Sum.Start >= settle.Seconds()-intervalSlack &&
			interval.Sum.Seconds >= fullInterval {
			rates = append(rates, interval.Sum.BitsPerSecond)
		}
	}

	if len(rates) == 0 {
		return 0, fmt.Errorf("%w: no interval after %s", errIperf3Output, settle)
	}

	slices.Sort(rates)

	middle := len(rates) / 2
	if len(rates)%2 == 0 {
		return (rates[middle-1] + rates[middle]) / 2, nil
	}

	return rates[middle], nil
}
