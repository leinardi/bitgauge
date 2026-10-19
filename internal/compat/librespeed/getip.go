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
	"net/netip"
	"strconv"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/handlers"
)

// getIPResponse is the body of GET /getIP: LibreSpeed's shape without ISP data, which its web
// UI and librespeed-cli both decode. BitGauge never looks an address up, so rawIspInfo is
// always an empty object.
type getIPResponse struct {
	RawISPInfo      struct{} `json:"rawIspInfo"`
	ProcessedString string   `json:"processedString"`
}

// accessClasses are LibreSpeed's classification strings by address class and IP version
// (compatibility.md section 2.1); a public address has none.
var accessClasses = map[clientip.Class]map[int]string{
	clientip.ClassLoopback:  {4: "localhost IPv4 access", 6: "localhost IPv6 access"},
	clientip.ClassLinkLocal: {4: "link-local IPv4 access", 6: "link-local IPv6 access"},
	clientip.ClassPrivate:   {4: "private IPv4 access"},
	clientip.ClassCGNAT:     {4: "CGNAT IPv4 access"},
	clientip.ClassULA:       {6: "ULA IPv6 access"},
}

// GetIP answers GET /getIP with the client IP the clientip middleware derived through trusted
// proxies only, as JSON, with LibreSpeed's classification string after a non-public address.
// isp and distance are ignored.
func GetIP(writer http.ResponseWriter, request *http.Request) {
	addr, derived := clientip.FromContext(request.Context())
	if !derived {
		// The router always runs the clientip middleware first; this is a wiring bug.
		handlers.WriteError(writer, http.StatusInternalServerError, handlers.CodeInternal,
			"client address unavailable", nil)

		return
	}

	body, err := json.Marshal(getIPResponse{ProcessedString: processedString(addr)})
	if err != nil {
		handlers.WriteError(writer, http.StatusInternalServerError, handlers.CodeInternal,
			"encode the address", nil)

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

// processedString is the address, a leading ::ffff: stripped, followed by its classification
// string when it is not public.
func processedString(addr netip.Addr) string {
	addr = addr.Unmap()
	text := addr.String()

	if class, classified := accessClasses[clientip.AddressClass(addr)][clientip.Version(addr)]; classified {
		return text + " - " + class
	}

	return text
}
