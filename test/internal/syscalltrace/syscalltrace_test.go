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

package syscalltrace_test

import (
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/syscalltrace"
)

// The probe-*.strace fixtures are recorded runs of test/image/testdata/probe in the tools image,
// under strace -f -yy -e syscalltrace.TraceSet, listening on 127.0.0.1:18080 and serving one
// request; wget-healthcheck.strace is busybox wget fetching from it, a client that connects once.
var probeListen = netip.MustParseAddrPort("127.0.0.1:18080")

// TestRecordedProbeTraces is the analyser's contract on real traces: the clean server passes, and
// each forbidden act is rejected for its own reason.
func TestRecordedProbeTraces(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		fixture string
		reason  string
	}{
		{"probe-serve.strace", ""},
		{"probe-connect-back.strace", "serve may not connect"},
		{"probe-sendto-peer.strace", "a send with an explicit destination address"},
		{"probe-file-create.strace", "openat with write intent on /tmp/probe-was-here"},
	} {
		t.Run(test.fixture, func(t *testing.T) {
			t.Parallel()

			violations, stats := syscalltrace.CheckServe(fixture(t, test.fixture), probeListen)

			if stats.AcceptedSends == 0 {
				t.Errorf("no send on the accepted connection was seen, so the trace proves nothing")
			}

			if test.reason == "" {
				if len(violations) != 0 {
					t.Errorf("the clean server was rejected: %v", violations)
				}

				return
			}

			if len(violations) == 0 {
				t.Fatalf("analyser blind: the trace passed")
			}

			if !containsReason(violations, test.reason) {
				t.Errorf("rejected, but not for %q: %v", test.reason, violations)
			}
		})
	}
}

func TestRecordedHealthcheckTrace(t *testing.T) {
	t.Parallel()

	events := fixture(t, "wget-healthcheck.strace")

	violations, stats := syscalltrace.CheckHealthcheck(events, probeListen)
	if len(violations) != 0 {
		t.Errorf("a single connect to the target was rejected: %v", violations)
	}

	if stats.Connects != 1 || stats.AcceptedSends == 0 {
		t.Errorf("stats = %+v, want one connect and a send on it", stats)
	}

	// The same client is a violation under the serve policy, and against any other target.
	violations, _ = syscalltrace.CheckServe(events, probeListen)
	if !containsReason(violations, "serve may not connect") {
		t.Errorf("serve accepted a connect: %v", violations)
	}

	violations, _ = syscalltrace.CheckHealthcheck(events, netip.MustParseAddrPort("127.0.0.1:9"))
	if !containsReason(violations, "may connect only to 127.0.0.1:9") {
		t.Errorf("a connect to the wrong port passed: %v", violations)
	}
}

// TestServePolicyLines covers the calls the recorded traces do not exercise, one line each.
func TestServePolicyLines(t *testing.T) {
	t.Parallel()

	listen := netip.MustParseAddrPort("0.0.0.0:8080")

	for _, test := range []struct {
		name   string
		line   string
		reason string
	}{
		{"write on an accepted IPv4 connection", `write(5<TCP:[172.18.0.2:8080->172.18.0.3:40000]>, "x", 1) = 1`, ""},
		{"writev on an accepted dual-stack connection", `writev(7<TCPv6:[[::ffff:127.0.0.1]:8080->[::ffff:127.0.0.1]:41000]>, [{iov_base="x", iov_len=1}], 1) = 1`, ""},
		{"sendfile to an accepted connection", `sendfile(5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>, 6</proc/self/fd/0>, NULL, 1) = 1`, ""},
		{"write to stderr", `write(2<pipe:[123]>, "log", 3) = 3`, ""},
		{"write to the netpoller", `write(4<anon_inode:[eventfd]>, "\1\0\0\0\0\0\0\0", 8) = 8`, ""},
		{"write to the netpoller, with its details", `write(5<{eventfd-count=0, eventfd-id=110, eventfd-semaphore=0}>, "\1\0\0\0\0\0\0\0", 8) = 8`, ""},
		{"send on a socket whose kind is unknown", `write(5<{weird-thing=1}>, "x", 1) = 1`, "not an allowed connection"},
		{"read-only open", `openat(AT_FDCWD</>, "/etc/hosts", O_RDONLY|O_CLOEXEC) = 3</etc/hosts>`, ""},
		{"write-open under /proc", `openat(AT_FDCWD</>, "/proc/self/attr/current", O_WRONLY) = -1 EACCES (Permission denied)`, ""},
		{"write-open of /dev/null", `openat(AT_FDCWD</>, "/dev/null", O_RDWR|O_CLOEXEC) = 3</dev/null<char 1:3>>`, ""},
		{"connect that failed", `connect(8<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("192.0.2.1")}, 16) = -1 ENETUNREACH (Network is unreachable)`, "serve may not connect"},
		{"connect over IPv6", `connect(8<TCPv6:[1]>, {sa_family=AF_INET6, sin6_port=htons(53), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:db8::1", &sin6_addr), sin6_scope_id=0}, 28) = -1 EINPROGRESS (Operation in progress)`, "serve may not connect"},
		{"send on a dialed connection", `write(8<TCP:[172.18.0.2:40000->192.0.2.1:443]>, "x", 1) = 1`, "not an allowed connection"},
		{"send on an accepted connection on another port", `write(8<TCP:[127.0.0.1:9090->127.0.0.1:40000]>, "x", 1) = 1`, "not an allowed connection"},
		{"send on a UDP socket", `write(8<UDP:[127.0.0.1:5000->127.0.0.1:53]>, "x", 1) = 1`, "not an allowed connection"},
		{"send on a unix socket", `sendmsg(8<UNIX:[1->2]>, {msg_iov=[{iov_base="x", iov_len=1}], msg_iovlen=1}, 0) = 1`, "not an allowed connection"},
		{"sendmsg with a destination on an accepted connection", `sendmsg(5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>, {msg_name={sa_family=AF_INET, sin_port=htons(9), sin_addr=inet_addr("192.0.2.1")}, msg_namelen=16, msg_iov=[{iov_base="x", iov_len=1}], msg_iovlen=1}, 0) = 1`, "explicit destination"},
		{"sendto with a destination", `sendto(8<UDP:[0.0.0.0:5000]>, "x", 1, 0, {sa_family=AF_INET, sin_port=htons(9), sin_addr=inet_addr("192.0.2.1")}, 16) = 1`, "explicit destination"},
		{"write to an unannotated descriptor", `write(9, "x", 1) = 1`, "could not name"},
		{"write to a file descriptor", `pwrite64(9</var/lib/state>, "x", 1, 0) = 1`, "outside /dev and /proc"},
		{"create", `creat("/tmp/x", 0644) = -1 EROFS (Read-only file system)`, "creat with write intent on /tmp/x"},
		{"relative open for writing", `openat(AT_FDCWD</srv>, "data/out", O_WRONLY|O_CREAT, 0600) = -1 EROFS (Read-only file system)`, "on /srv/data/out"},
		{"relative open with no directory", `openat(9, "out", O_APPEND) = -1 EBADF (Bad file descriptor)`, "on out"},
		{"open escaping /dev", `open("/dev/../etc/passwd", O_WRONLY) = -1 EACCES (Permission denied)`, "on /etc/passwd"},
		{"mkdir", `mkdirat(AT_FDCWD</>, "/tmp/d", 0755) = 0`, "mkdirat"},
		{"rename", `renameat2(AT_FDCWD</>, "/tmp/a", AT_FDCWD</>, "/tmp/b", 0) = 0`, "renameat2"},
		{"unlink", `unlinkat(AT_FDCWD</>, "/tmp/a", 0) = 0`, "unlinkat"},
		{"truncate", `truncate("/tmp/a", 0) = 0`, "truncate"},
		{"a write-intent call with no path", `utimensat(5</tmp/a>, NULL, [UTIME_NOW, UTIME_NOW], 0) = 0`, "could not name"},
		{"a shared-memory file", `openat(AT_FDCWD</>, "/dev/shm/state", O_RDWR|O_CREAT, 0600) = 3</dev/shm/state>`, "on /dev/shm/state"},
		{"a unix socket node", `bind(3<UNIX:[1]>, {sa_family=AF_UNIX, sun_path="/tmp/s.sock"}, 110) = 0`, "socket node /tmp/s.sock"},
		{"an abstract unix socket", `bind(3<UNIX:[1]>, {sa_family=AF_UNIX, sun_path=@"bitgauge"}, 11) = 0`, ""},
		{"an IP bind", `bind(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(8080), sin_addr=inet_addr("0.0.0.0")}, 16) = 0`, ""},
	} {
		events, err := syscalltrace.Parse(strings.NewReader("1 " + test.line + "\n"))
		if err != nil {
			t.Errorf("%s: %v", test.name, err)

			continue
		}

		violations, _ := syscalltrace.CheckServe(events, listen)

		switch {
		case test.reason == "" && len(violations) != 0:
			t.Errorf("%s was rejected: %v", test.name, violations)
		case test.reason != "" && !containsReason(violations, test.reason):
			t.Errorf("%s was not rejected for %q: %v", test.name, test.reason, violations)
		}
	}
}

// TestServeOnASpecificAddress pins that a specific listen address allows only connections accepted
// on that address.
func TestServeOnASpecificAddress(t *testing.T) {
	t.Parallel()

	events, err := syscalltrace.Parse(strings.NewReader(
		"1 write(5<TCP:[10.0.0.1:8080->10.0.0.9:40000]>, \"x\", 1) = 1\n" +
			"1 write(6<TCP:[10.0.0.2:8080->10.0.0.9:40001]>, \"x\", 1) = 1\n"))
	if err != nil {
		t.Fatal(err)
	}

	violations, stats := syscalltrace.CheckServe(events, netip.MustParseAddrPort("10.0.0.1:8080"))
	if len(violations) != 1 || violations[0].Event.Line != 2 || stats.AcceptedSends != 1 {
		t.Errorf(
			"violations = %v, stats = %+v; want only the second write rejected",
			violations,
			stats,
		)
	}
}

func TestHealthcheckPolicyLines(t *testing.T) {
	t.Parallel()

	target := netip.MustParseAddrPort("127.0.0.1:8080")
	connect := `connect(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(8080), sin_addr=inet_addr("127.0.0.1")}, 16) = 0` + "\n"
	send := `write(3<TCP:[127.0.0.1:40000->127.0.0.1:8080]>, "GET", 3) = 3` + "\n"

	for _, test := range []struct {
		name   string
		trace  string
		target netip.AddrPort
		reason string
	}{
		{"one connect and its request", connect + send, target, ""},
		{"IPv6 loopback", `connect(3<TCPv6:[1]>, {sa_family=AF_INET6, sin6_port=htons(8080), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "::1", &sin6_addr), sin6_scope_id=0}, 28) = 0` + "\n", netip.MustParseAddrPort("[::1]:8080"), ""},
		{"no connect", send, target, "connected 0 times"},
		{"two connects", connect + connect, target, "connected 2 times"},
		{"a non-loopback target", connect, netip.MustParseAddrPort("192.0.2.1:8080"), "not loopback"},
		{"a send elsewhere", connect + `write(4<TCP:[127.0.0.1:40001->127.0.0.1:9090]>, "x", 1) = 1` + "\n", target, "not an allowed connection"},
		{"a file write", connect + `openat(AT_FDCWD</>, "/tmp/x", O_WRONLY|O_CREAT, 0600) = 3</tmp/x>` + "\n", target, "outside /dev and /proc"},
	} {
		events, err := syscalltrace.Parse(strings.NewReader(test.trace))
		if err != nil {
			t.Errorf("%s: %v", test.name, err)

			continue
		}

		violations, _ := syscalltrace.CheckHealthcheck(events, test.target)

		switch {
		case test.reason == "" && len(violations) != 0:
			t.Errorf("%s was rejected: %v", test.name, violations)
		case test.reason != "" && !containsReason(violations, test.reason):
			t.Errorf("%s was not rejected for %q: %v", test.name, test.reason, violations)
		}
	}
}

// TestParse covers the shapes of strace output the fixtures may not: interleaved calls split into
// unfinished and resumed halves, pid prefixes in both forms, signals and exits, nested
// annotations, and a call cut off by the process exiting.
func TestParse(t *testing.T) {
	t.Parallel()

	trace := strings.Join([]string{
		`[pid  12] connect(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("192.0.2.1")}, 16 <unfinished ...>`,
		`13    write(1<pipe:[5]>, "a) = 1, (\"b", 7) = 7`,
		`--- SIGURG {si_signo=SIGURG, si_code=SI_TKILL, si_pid=12, si_uid=0} ---`,
		`[pid  12] <... connect resumed>) = -1 EINPROGRESS (Operation in progress)`,
		`13    fcntl(0</dev/null<char 1:3>>, F_GETFL) = 0x8002 (flags O_RDWR|O_LARGEFILE)`,
		`13    +++ exited with 0 +++`,
		`14    openat(AT_FDCWD</>, "/tmp/x", O_WRONLY <unfinished ...>`,
		``,
	}, "\n")

	events, err := syscalltrace.Parse(strings.NewReader(trace))
	if err != nil {
		t.Fatal(err)
	}

	if len(events) != 4 {
		t.Fatalf("parsed %d events, want 4: %v", len(events), events)
	}

	connect := events[1]
	if connect.Name != "connect" || connect.PID != 12 || connect.Line != 1 ||
		len(connect.Args) != 3 ||
		!strings.HasPrefix(connect.Result, "-1 EINPROGRESS") {
		t.Errorf("connect = %+v", connect)
	}

	if write := events[0]; write.Name != "write" || len(write.Args) != 3 ||
		write.Args[1] != `"a) = 1, (\"b"` {
		t.Errorf("write = %+v", write)
	}

	if fcntl := events[2]; syscalltrace.ParseDescriptor(fcntl.Args[0]).Path != "/dev/null" {
		t.Errorf("fcntl descriptor = %+v", syscalltrace.ParseDescriptor(fcntl.Args[0]))
	}

	if cut := events[3]; cut.Name != "openat" || cut.Result != "?" {
		t.Errorf("an interrupted call = %+v", cut)
	}

	// A call strace could not identify is read, with no arguments, and judged by no policy.
	unknown, err := syscalltrace.Parse(strings.NewReader(
		"7 ???()                                   = ?\n8 ???( <unfinished ...>\n"))
	if err != nil || len(unknown) != 2 || unknown[0].Name != syscalltrace.UnknownCall ||
		len(unknown[0].Args) != 0 || unknown[1].Result != "?" {
		t.Errorf("unidentified calls = %+v, %v", unknown, err)
	}

	for _, bad := range []string{
		"1 not a call\n",
		"1 write(1, \"x\", 1\n",
		"1 <... write resumed>) = 1\n",
		"1 ???(5<TCP:[1]>, \"x\", 1) = 1\n",
	} {
		_, err = syscalltrace.Parse(strings.NewReader(bad))
		if err == nil {
			t.Errorf("%q parsed", bad)
		}
	}
}

func fixture(t *testing.T, name string) []syscalltrace.Event {
	t.Helper()

	file, err := os.Open(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	events, err := syscalltrace.Parse(file)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}

	if len(events) == 0 {
		t.Fatalf("%s holds no calls", name)
	}

	return events
}

func containsReason(violations []syscalltrace.Violation, want string) bool {
	for _, violation := range violations {
		if strings.Contains(violation.Reason, want) {
			return true
		}
	}

	return false
}
