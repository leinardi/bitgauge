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
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/leinardi/bitgauge/internal/handlers"
)

// WellKnown answers GET /.well-known/librespeed with a server list of one entry describing
// this instance (compatibility.md section 2.4): id 1, displayName as its name, and as its
// server the request origin of handlers.RequestOrigin, the base path and a slash. Plain http is
// allowed: LibreSpeed clients work over it.
func WellKnown(publicURL, basePath, displayName string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		origin, _ := handlers.RequestOrigin(request, publicURL, basePath)

		// One entry of a librespeed-cli server list, with LibreSpeed's field names
		// (compatibility.md section 2.3); the URL fields are relative to server.
		body, err := json.Marshal([]map[string]any{{
			"id":       1,
			"name":     displayName,
			"server":   origin + "/",
			"dlURL":    nameGarbage,
			"ulURL":    nameEmpty,
			"pingURL":  nameEmpty,
			"getIpURL": nameGetIP,
		}})
		if err != nil {
			handlers.WriteError(writer, http.StatusInternalServerError, handlers.CodeInternal,
				"encode the server list", nil)

			return
		}

		header := writer.Header()
		header["Cache-Control"] = handlers.NoStore
		header["Content-Type"] = handlers.JSONType
		header["Content-Length"] = []string{strconv.Itoa(len(body))}

		writer.WriteHeader(http.StatusOK)

		// A failed write means the client is gone; nobody is left to answer.
		_, _ = writer.Write(body)
	}
}
