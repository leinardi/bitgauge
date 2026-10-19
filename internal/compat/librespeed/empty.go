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

package librespeed

import (
	"net/http"
	"time"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// keepAlive is the Connection value /empty sends on HTTP/1.1.
var keepAlive = []string{"keep-alive"}

// Empty answers GET and POST /empty, LibreSpeed's upload and ping: it drains any body, up to
// maxUploadBytes whether or not it declares its length, within the native upload's lifetime
// from handler entry on now, and then answers 200 with an empty body and, on HTTP/1.1,
// Connection: keep-alive (compatibility.md section 2.1). A body over the cap, or one that
// outlives the lifetime, gets the answer of handlers.DrainBody.
func Empty(now func() time.Time, maxUploadBytes int64, transfer metrics.Transfer) http.HandlerFunc {
	options := handlers.DrainOptions{
		Limit:    maxUploadBytes,
		Lifetime: handlers.UploadLifetime,
		Transfer: transfer,
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		_, drained := handlers.DrainBody(writer, request, now(), &options, nil)
		if !drained {
			return
		}

		if request.ProtoMajor == 1 && request.ProtoMinor == 1 {
			writer.Header()["Connection"] = keepAlive
		}

		answerEmpty(writer)
	}
}
