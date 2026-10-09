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

// Command probe is the negative control of the image test's syscall analyser (testing.md section
// 5). It serves one HTTP request the way bitgauge serve does, then does one thing the serve policy
// forbids, chosen by -mode, so the analyser can be shown to reject it:
//
//   - serve: nothing more; the trace must pass, or the analyser rejects a clean server;
//   - connect-back: connect to the peer that just connected in;
//   - sendto-peer: send a UDP datagram to the peer's address from an unconnected socket;
//   - file-create: create a file.
//
// It lives under testdata, so go build ./... and go vet ./... never see it; the image test builds
// it by path.
package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
)

var errUnknownMode = errors.New("unknown mode")

func main() {
	listen := flag.String("listen", "127.0.0.1:18080", "address to accept one request on")
	mode := flag.String("mode", "serve", "serve, connect-back, sendto-peer or file-create")
	dir := flag.String("dir", os.TempDir(), "directory the file-create mode writes into")
	flag.Parse()

	err := run(*listen, *mode, *dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "probe:", err)
		os.Exit(1)
	}
}

func run(listen, mode, dir string) error {
	switch mode {
	case "serve", "connect-back", "sendto-peer", "file-create":
	default:
		return fmt.Errorf("%w: %q", errUnknownMode, mode)
	}

	listener, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()

	conn, err := listener.Accept()
	if err != nil {
		return fmt.Errorf("accept: %w", err)
	}
	defer conn.Close()

	_, err = bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return fmt.Errorf("read the request: %w", err)
	}

	_, err = conn.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nok\n"))
	if err != nil {
		return fmt.Errorf("respond: %w", err)
	}

	peer, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("peer address %v is not TCP", conn.RemoteAddr())
	}

	// The forbidden act is attempted, and its outcome does not matter: the analyser judges the
	// attempt, so a refused connect or an undelivered datagram must fail the trace all the same.
	switch mode {
	case "connect-back":
		back, dialErr := net.DialTCP("tcp", nil, peer)
		if dialErr == nil {
			back.Close()
		}
	case "sendto-peer":
		socket, listenErr := net.ListenUDP("udp", &net.UDPAddr{IP: peer.IP})
		if listenErr != nil {
			return fmt.Errorf("open a UDP socket: %w", listenErr)
		}
		defer socket.Close()

		_, _ = socket.WriteToUDP([]byte("probe"), &net.UDPAddr{IP: peer.IP, Port: peer.Port})
	case "file-create":
		file, createErr := os.Create(filepath.Join(dir, "probe-was-here"))
		if createErr != nil {
			return fmt.Errorf("create: %w", createErr)
		}

		file.Close()
	}

	return nil
}
