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
	"bufio"
	"bytes"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestNewBufferIsFourMiBOfRandomBytes(t *testing.T) {
	t.Parallel()

	buffer := NewBuffer()

	if len(buffer.data) != 4*1024*1024 || buffer.stallTimeout != 30*time.Second {
		t.Fatalf("buffer of %d bytes and a %v deadline, want 4 MiB and 30 s",
			len(buffer.data), buffer.stallTimeout)
	}

	// 4 MiB of zeros from crypto/rand would be a broken source, not bad luck.
	if bytes.Count(buffer.data, []byte{0}) == len(buffer.data) {
		t.Fatal("the buffer is all zeros")
	}
}

func TestWriteRandomExactCountAndWrapAround(t *testing.T) {
	t.Parallel()

	const size = 1000

	buffer := newBuffer(size, time.Second)

	for _, n := range []int64{1, size - 1, size, size + 1, 3*size + 500} {
		writer := newRecordingWriter()

		err := buffer.WriteRandom(writer, n, noTransfer)
		if err != nil {
			t.Fatalf("n=%d: %v", n, err)
		}

		body := writer.body.Bytes()
		if int64(len(body)) != n {
			t.Fatalf("n=%d: wrote %d bytes", n, len(body))
		}

		for index, got := range body {
			if got != buffer.data[index%size] {
				t.Fatalf("n=%d: byte %d is not buffer byte %d", n, index, index%size)
			}
		}

		if writer.writesWithout != 0 {
			t.Fatalf("n=%d: %d writes without a fresh deadline", n, writer.writesWithout)
		}
	}
}

func TestWriteRandomBoundsEachWrite(t *testing.T) {
	t.Parallel()

	buffer := NewBuffer()
	writer := newRecordingWriter()

	// One and a half buffers: the wrap-around falls in the middle of the 64 KiB grid.
	const n = BufferSize + BufferSize/2 + 123

	err := buffer.WriteRandom(writer, n, noTransfer)
	if err != nil {
		t.Fatal(err)
	}

	total := 0

	for _, size := range writer.writes {
		if size > MaxWrite || size == 0 {
			t.Fatalf("a write of %d bytes, want 1 to %d", size, MaxWrite)
		}

		total += size
	}

	wrapped := writer.body.Bytes()[BufferSize : BufferSize+BufferSize/2]
	if total != n || !bytes.Equal(wrapped, buffer.data[:BufferSize/2]) {
		t.Fatalf("wrote %d bytes, want %d wrapping to the buffer start", total, n)
	}
}

func TestWriteRandomNeedsWriteDeadlines(t *testing.T) {
	t.Parallel()

	// httptest.ResponseRecorder cannot set deadlines: writing without the stall guard would
	// let a stalled client hold the handler forever, so WriteRandom refuses.
	err := newBuffer(10, time.Second).WriteRandom(httptest.NewRecorder(), 5, noTransfer)
	if !errors.Is(err, http.ErrNotSupported) {
		t.Fatalf("err = %v, want http.ErrNotSupported", err)
	}
}

func TestWriteRandomCutsAStalledReader(t *testing.T) {
	t.Parallel()

	const stall = 200 * time.Millisecond

	buffer := newBuffer(BufferSize, stall)
	result := make(chan error, 1)

	server := httptest.NewServer(
		http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			// Far more than the socket buffers on both ends can hold.
			result <- buffer.WriteRandom(writer, 1<<34, noTransfer)
		}),
	)
	t.Cleanup(server.Close)

	var dialer net.Dialer

	conn, err := dialer.DialContext(t.Context(), "tcp", server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.Close() })

	tcpConn, ok := conn.(*net.TCPConn)
	if !ok {
		t.Fatalf("connection is a %T", conn)
	}

	err = tcpConn.SetReadBuffer(4096)
	if err != nil {
		t.Fatal(err)
	}

	_, err = conn.Write([]byte("GET / HTTP/1.1\r\nHost: test\r\n\r\n"))
	if err != nil {
		t.Fatal(err)
	}

	// Read the status line, so the response has started, then stop reading.
	status, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil || status != "HTTP/1.1 200 OK\r\n" {
		t.Fatalf("status line %q, %v", status, err)
	}

	select {
	case err = <-result:
		if !errors.Is(err, os.ErrDeadlineExceeded) {
			t.Fatalf("err = %v, want the write deadline exceeded", err)
		}
	case <-time.After(30 * time.Second):
		// A failsafe against a hang, far above the deadline under test; not a wait for state.
		t.Fatal("the stalled write was not cut")
	}
}
