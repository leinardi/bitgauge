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

package openspeedtest

import (
	"net/http"
	"time"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// UploadCap is the fixed cap of a POST /upload body: 35 MiB. limits.max_upload_bytes does not
// change it; it only gates startup.
const UploadCap = 35 << 20

// Ping answers GET and HEAD /upload, OpenSpeedTest's ping, with 200 and an empty body: its
// client accepts only 200, never 204.
func Ping(writer http.ResponseWriter, _ *http.Request) {
	answerEmpty(writer)
}

// Upload answers POST /upload: it drains the body, up to UploadCap whether or not it declares
// its length, within the native upload's lifetime from handler entry on now, and then answers
// 200 with an empty body. A body over the cap, or one that outlives the lifetime, gets the
// answer of handlers.DrainBody.
func Upload(now func() time.Time, transfer metrics.Transfer) http.HandlerFunc {
	options := handlers.DrainOptions{
		Limit:    UploadCap,
		Lifetime: handlers.UploadLifetime,
		Transfer: transfer,
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		_, drained := handlers.DrainBody(writer, request, now(), &options, nil)
		if !drained {
			return
		}

		answerEmpty(writer)
	}
}
