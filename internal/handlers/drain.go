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

package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
)

// drainBufferSize is the size of each pooled read buffer (backend.md section 2.2).
const drainBufferSize = 64 << 10

// drainBuffers holds the read buffers shared by every route that drains a body, so a request
// allocates none of its own.
var drainBuffers = sync.Pool{
	New: func() any {
		buffer := make([]byte, drainBufferSize)

		return &buffer
	},
}

// Drain reads request's body to its end and discards it, reading at most limit bytes through
// http.MaxBytesReader, so a body longer than its declared length, or one without a length, is
// cut at the cap. After every read that returned bytes, onRead is called with their count;
// an error from it stops the drain and is returned. The result is the number of bytes read
// and the first error other than the body's end; a body over limit gives an error matching
// *http.MaxBytesError.
func Drain(
	writer http.ResponseWriter,
	request *http.Request,
	limit int64,
	onRead func(read int) error,
) (int64, error) {
	pooled, _ := drainBuffers.Get().(*[]byte)
	defer drainBuffers.Put(pooled)

	buffer := *pooled
	body := http.MaxBytesReader(writer, request.Body, limit)

	var total int64

	for {
		read, err := body.Read(buffer)
		if read > 0 {
			total += int64(read)

			callbackErr := onRead(read)
			if callbackErr != nil {
				return total, callbackErr
			}
		}

		if errors.Is(err, io.EOF) {
			return total, nil
		}

		if err != nil {
			return total, fmt.Errorf("drain the body: %w", err)
		}
	}
}
