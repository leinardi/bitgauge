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

package metrics

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// Group is the group label: the owner of the route that matched (backend.md section 7).
type Group string

// The route groups.
const (
	GroupSPA           Group = "spa"
	GroupAPI           Group = "api"
	GroupOpenSpeedTest Group = "openspeedtest"
	GroupLibreSpeed    Group = "librespeed"
	GroupNQ            Group = "nq"
	GroupMetrics       Group = "metrics"
)

// carriesTransfers reports whether a group has throughput routes, and so transfer series.
func (g Group) carriesTransfers() bool {
	switch g {
	case GroupAPI, GroupOpenSpeedTest, GroupLibreSpeed, GroupNQ:
		return true
	case GroupSPA, GroupMetrics:
		return false
	}

	return false
}

// Direction is the direction label of a transfer.
type Direction string

// The transfer directions: bytes sent and bytes drained.
const (
	Download Direction = "download"
	Upload   Direction = "upload"
)

// directions are both directions, in label order.
var directions = [...]Direction{Download, Upload}

// Limit is the limit label of a rejection.
type Limit string

// The limits a request can be refused by.
const (
	LimitStreams   Limit = "streams"
	LimitRate      Limit = "rate"
	LimitWebSocket Limit = "websocket"
	LimitNQFlows   Limit = "nq_flows"
	LimitTableFull Limit = "table_full"
)

// sentinels map the ratelimit sentinel an acquisition was refused with to its limit label.
var sentinels = [...]struct {
	err   error
	limit Limit
}{
	{ratelimit.ErrStreams, LimitStreams},
	{ratelimit.ErrRate, LimitRate},
	{ratelimit.ErrWebSockets, LimitWebSocket},
	{ratelimit.ErrFlows, LimitNQFlows},
	{ratelimit.ErrTableFull, LimitTableFull},
}

// limitOf is the limit label of a refusal; any other error has none.
func limitOf(err error) (Limit, bool) {
	for _, sentinel := range sentinels {
		if errors.Is(err, sentinel.err) {
			return sentinel.limit, true
		}
	}

	return "", false
}

// Unmatched is the route label of a request no route matched.
const Unmatched = "unmatched"

// Route is a route the router mounts: its pattern as the route table writes it, without
// base_path, and the group of its owner.
type Route struct {
	Pattern string
	Group   Group
}

// codeOther is the code label of a status BitGauge does not answer, and of a request that
// ended without any response.
const codeOther = "other"

// answeredStatuses are the statuses that are their own code label (backend.md section 7).
var answeredStatuses = [...]int{
	http.StatusSwitchingProtocols,
	http.StatusOK,
	http.StatusNoContent,
	http.StatusPartialContent,
	http.StatusNotModified,
	http.StatusBadRequest,
	http.StatusForbidden,
	http.StatusNotFound,
	http.StatusMethodNotAllowed,
	http.StatusRequestTimeout,
	http.StatusLengthRequired,
	http.StatusRequestEntityTooLarge,
	http.StatusRequestedRangeNotSatisfiable,
	http.StatusTooManyRequests,
	http.StatusInternalServerError,
}

// codeSlots is one code label per answered status, plus other.
const codeSlots = len(answeredStatuses) + 1

// codeLabels are the code labels by slot, built once.
var codeLabels = func() [codeSlots]string {
	var labels [codeSlots]string

	for index, status := range answeredStatuses {
		labels[index] = strconv.Itoa(status)
	}

	labels[codeSlots-1] = codeOther

	return labels
}()

// codeSlot is the slot of a status: its own when BitGauge answers it, other's otherwise.
func codeSlot(status int) int {
	for index, answered := range answeredStatuses {
		if status == answered {
			return index
		}
	}

	return codeSlots - 1
}
