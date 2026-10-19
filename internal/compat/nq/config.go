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

package nq

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/leinardi/bitgauge/internal/handlers"
)

// configVersion is the version field of the config JSON.
const configVersion = 1

// Config answers GET /nq/config and /.well-known/nq with the config JSON of compatibility.md
// section 3.2: both key sets, Apple's and the IETF responsiveness draft's, pointing at the same
// absolute https URLs, the request origin of handlers.RequestOrigin, the base path and the
// route. When that origin is not https it answers 503 public_url_required instead, naming
// server.public_url (section 3.3).
func Config(publicURL, basePath string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		origin, secure := handlers.RequestOrigin(request, publicURL, basePath)
		if !secure {
			handlers.WriteError(writer, http.StatusServiceUnavailable,
				handlers.CodePublicURLRequired,
				"networkQuality needs https URLs: set server.public_url to the https URL "+
					"clients use, or serve BitGauge behind a trusted proxy that forwards "+
					"X-Forwarded-Proto: https", nil)

			return
		}

		small, large, upload := origin+SmallPath, origin+LargePath, origin+UploadPath

		// The keys are the clients' own (compatibility.md section 3.2).
		body, err := json.Marshal(map[string]any{
			"version": configVersion,
			"urls": map[string]string{
				"small_https_download_url": small,
				"large_https_download_url": large,
				"https_upload_url":         upload,
				"small_download_url":       small,
				"large_download_url":       large,
				"upload_url":               upload,
			},
		})
		if err != nil {
			handlers.WriteError(writer, http.StatusInternalServerError, handlers.CodeInternal,
				"encode the config", nil)

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
