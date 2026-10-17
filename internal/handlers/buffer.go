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
	"crypto/rand"
	"fmt"
	"net/http"
	"time"

	"github.com/leinardi/bitgauge/internal/metrics"
)

const (
	// BufferSize is the size of the random buffer generated at startup (backend.md section 2.1).
	BufferSize = 4 << 20
	// MaxWrite bounds each write, so the stall deadline catches a client that stopped reading
	// and never a slow link: 64 KiB take about 5 s at 100 kbit/s.
	MaxWrite = 64 << 10
	// WriteStallTimeout is the write deadline set before each write.
	WriteStallTimeout = 30 * time.Second
)

// Buffer is the in-memory random buffer that every response streaming random bytes is cut
// from: native download, and later the compatibility layers' download routes. It is generated
// once and only read afterwards, so it is shared by every request without locking.
type Buffer struct {
	data         []byte
	stallTimeout time.Duration
}

// NewBuffer generates the 4 MiB buffer from crypto/rand.
func NewBuffer() *Buffer {
	return newBuffer(BufferSize, WriteStallTimeout)
}

func newBuffer(size int, stallTimeout time.Duration) *Buffer {
	data := make([]byte, size)
	// crypto/rand.Read never returns an error: it crashes the program instead.
	_, _ = rand.Read(data)

	return &Buffer{data: data, stallTimeout: stallTimeout}
}

// WriteRandom writes exactly size bytes to writer as consecutive slices of the buffer, wrapping
// around at its end, without allocating or copying. Before each write it sets a write deadline
// of WriteStallTimeout through http.ResponseController, so a client that stops reading is cut
// after that long while a slow one is not. The caller sets the headers first. The error is the
// first failed write, which in practice means the client went away or stalled. transfer counts
// the response as in progress while it is written, the bytes written, and a failed write as an
// abort.
func (b *Buffer) WriteRandom(
	writer http.ResponseWriter,
	size int64,
	transfer metrics.Transfer,
) error {
	controller := http.NewResponseController(writer)
	offset := 0

	transfer.Start()
	defer transfer.Done()

	for size > 0 {
		chunk := int(min(size, int64(min(MaxWrite, len(b.data)-offset))))

		err := controller.SetWriteDeadline(time.Now().Add(b.stallTimeout))
		if err != nil {
			return fmt.Errorf("set the write deadline: %w", err)
		}

		written, err := writer.Write(b.data[offset : offset+chunk])
		transfer.Add(written)

		if err != nil {
			transfer.Abort()

			return fmt.Errorf("write random bytes: %w", err)
		}

		size -= int64(written)
		offset = (offset + written) % len(b.data)
	}

	return nil
}
