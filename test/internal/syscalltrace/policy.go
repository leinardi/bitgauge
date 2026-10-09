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

package syscalltrace

import (
	"fmt"
	"net/netip"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// TraceSet is the strace -e argument the policies are written against: every call that opens,
// names or writes a file, every network call, and the descriptor calls that move a socket to
// another number.
const TraceSet = "trace=%network,%file,write,writev,pwrite64,sendfile,dup,dup2,dup3,fcntl,close"

// Violation is one call a policy forbids.
type Violation struct {
	Event  Event
	Reason string
}

func (v Violation) String() string {
	return v.Reason + ": " + v.Event.String()
}

// Stats says how much of a trace a policy looked at, so a caller can tell a clean trace from an
// empty or blind one.
type Stats struct {
	Events int
	// AcceptedSends counts sends on accepted connections (serve) or on the connection to the
	// target (healthcheck): proof that the traffic the test drove is in the trace.
	AcceptedSends int
	Connects      int
}

// Descriptor kinds that are not a socket protocol.
const (
	KindPath        = "path"
	KindUnannotated = "unannotated"
)

// sendtoAddressArg is the index of sendto's destination address argument.
const sendtoAddressArg = 4

// Descriptor is what a -yy annotation says a descriptor is.
type Descriptor struct {
	// Kind is the socket protocol (TCP, TCPv6, UDP, UNIX, ...), "path", or another strace kind
	// such as pipe or anon_inode. Empty when the descriptor carries no annotation.
	Kind string
	// Path is set for Kind "path".
	Path string
	// Local and Remote are set for a connected IP socket; Local alone for a bound one.
	Local, Remote netip.AddrPort
}

// IsSocket reports whether the descriptor is a socket of any family.
func (d *Descriptor) IsSocket() bool {
	return d.Kind != "" && d.Kind != KindPath && d.Kind != "pipe" && d.Kind != "anon_inode" &&
		d.Kind != "char" && d.Kind != KindUnannotated
}

var annotation = regexp.MustCompile(`^(?:-?\d+|AT_FDCWD)<(.*)>$`)

// ParseDescriptor reads an argument such as 5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>,
// 3</etc/hosts> or 1<pipe:[123]>.
func ParseDescriptor(arg string) Descriptor {
	match := annotation.FindStringSubmatch(arg)
	if match == nil {
		return Descriptor{Kind: KindUnannotated}
	}

	inner := match[1]

	if strings.HasPrefix(inner, "/") {
		// A device carries a nested annotation: /dev/null<char 1:3>.
		pathOnly, _, _ := strings.Cut(inner, "<")

		return Descriptor{Kind: KindPath, Path: pathOnly}
	}

	kind, rest, found := strings.Cut(inner, ":[")
	if !found {
		kind, _, _ = strings.Cut(inner, ":")

		return Descriptor{Kind: kind}
	}

	descriptor := Descriptor{Kind: kind}

	endpoints := strings.TrimSuffix(rest, "]")
	local, remote, connected := strings.Cut(endpoints, "->")

	// An endpoint that is not an address -- an inode number, a unix path -- stays unset.
	descriptor.Local, _ = netip.ParseAddrPort(local)

	if connected {
		descriptor.Remote, _ = netip.ParseAddrPort(remote)
	}

	return descriptor
}

var (
	ipv4Address = regexp.MustCompile(`sin_port=htons\((\d+)\), sin_addr=inet_addr\("([^"]+)"\)`)
	ipv6Address = regexp.MustCompile(`sin6_port=htons\((\d+)\).*inet_pton\(AF_INET6, "([^"]+)"`)
)

// SocketAddress reads a sockaddr argument such as
// {sa_family=AF_INET, sin_port=htons(8080), sin_addr=inet_addr("127.0.0.1")}.
func SocketAddress(arg string) (netip.AddrPort, bool) {
	for _, pattern := range []*regexp.Regexp{ipv4Address, ipv6Address} {
		match := pattern.FindStringSubmatch(arg)
		if match == nil {
			continue
		}

		port, err := strconv.ParseUint(match[1], 10, 16)
		if err != nil {
			return netip.AddrPort{}, false
		}

		addr, err := netip.ParseAddr(match[2])
		if err != nil {
			return netip.AddrPort{}, false
		}

		return netip.AddrPortFrom(addr.Unmap(), uint16(port)), true
	}

	return netip.AddrPort{}, false
}

// sendCalls write to a descriptor named by their first argument (sendfile: its out_fd).
var sendCalls = []string{
	"write",
	"writev",
	"pwrite64",
	"pwritev",
	"pwritev2",
	"sendto",
	"sendmsg",
	"sendmmsg",
	"sendfile",
}

// pathWriters are the calls that create, change or remove a name in the filesystem; any of them
// on a path outside /dev and /proc is a write attempt, whatever its flags.
var pathWriters = []string{
	"creat", "mkdir", "mkdirat", "rename", "renameat", "renameat2", "unlink", "unlinkat", "rmdir",
	"link", "linkat", "symlink", "symlinkat", "mknod", "mknodat", "truncate", "chmod", "fchmodat",
	"fchmodat2", "chown", "lchown", "fchownat", "utime", "utimes", "utimensat", "futimesat",
	"setxattr", "lsetxattr", "removexattr", "lremovexattr",
}

// openCalls open a path; they write when their flags say so.
var openCalls = []string{"open", "openat", "openat2"}

var writeFlags = regexp.MustCompile(`\bO_(WRONLY|RDWR|CREAT|TRUNC|APPEND|TMPFILE)\b`)

// CheckServe judges a trace of bitgauge serve listening on listen. An unspecified listen address
// (0.0.0.0 or ::) accepts on any local address with that port.
func CheckServe(events []Event, listen netip.AddrPort) ([]Violation, Stats) {
	var violations []Violation

	stats := Stats{Events: len(events)}

	for _, event := range events {
		if event.Name == "connect" {
			stats.Connects++

			violations = append(violations, Violation{event, "serve may not connect"})

			continue
		}

		if reason, isSend, accepted := judgeSend(event, func(d *Descriptor) bool {
			return isAcceptedOn(d, listen)
		}); isSend {
			if accepted {
				stats.AcceptedSends++
			}

			if reason != "" {
				violations = append(violations, Violation{event, reason})
			}

			continue
		}

		if reason := judgeFile(event); reason != "" {
			violations = append(violations, Violation{event, reason})
		}
	}

	return violations, stats
}

// CheckHealthcheck judges a trace of bitgauge healthcheck, which must connect exactly once, to
// target, and send only on that connection.
func CheckHealthcheck(events []Event, target netip.AddrPort) ([]Violation, Stats) {
	var violations []Violation

	stats := Stats{Events: len(events)}

	if !target.Addr().IsLoopback() {
		violations = append(
			violations,
			Violation{Event{}, fmt.Sprintf("the healthcheck target %s is not loopback", target)},
		)
	}

	var connects []Event

	for _, event := range events {
		if event.Name == "connect" {
			stats.Connects++

			connects = append(connects, event)

			address, ok := SocketAddress(argument(event, 1))
			if !ok || address != target {
				violations = append(
					violations,
					Violation{event, "the healthcheck may connect only to " + target.String()},
				)
			}

			continue
		}

		if reason, isSend, accepted := judgeSend(event, func(d *Descriptor) bool {
			return isTCP(d) && d.Remote.IsValid() && unmapped(d.Remote) == target
		}); isSend {
			if accepted {
				stats.AcceptedSends++
			}

			if reason != "" {
				violations = append(violations, Violation{event, reason})
			}

			continue
		}

		if reason := judgeFile(event); reason != "" {
			violations = append(violations, Violation{event, reason})
		}
	}

	if len(connects) != 1 {
		violations = append(
			violations,
			Violation{
				Event{},
				fmt.Sprintf("the healthcheck connected %d times, want exactly once", len(connects)),
			},
		)
	}

	return violations, stats
}

// judgeSend reports whether event writes to a descriptor, why it is forbidden (empty when it is
// allowed), and whether it is a send on a connection allowed reports as the expected one.
func judgeSend(event Event, allowed func(*Descriptor) bool) (reason string, isSend, expected bool) {
	if !slices.Contains(sendCalls, event.Name) {
		return "", false, false
	}

	if hasDestination(event) {
		return "a send with an explicit destination address", true, false
	}

	descriptor := ParseDescriptor(argument(event, 0))

	switch {
	case descriptor.Kind == KindUnannotated:
		return "a write to a descriptor strace could not name", true, false
	case descriptor.IsSocket():
		if allowed(&descriptor) {
			return "", true, true
		}

		return "a send on a socket that is not an allowed connection", true, false
	case descriptor.Kind == KindPath && !underDevOrProc(descriptor.Path):
		return "a write to a file outside /dev and /proc", true, false
	}

	return "", true, false
}

func hasDestination(event Event) bool {
	switch event.Name {
	case "sendto":
		return argument(event, sendtoAddressArg) != "" &&
			argument(event, sendtoAddressArg) != "NULL"
	case "sendmsg", "sendmmsg":
		return strings.Contains(argument(event, 1), "msg_name={")
	}

	return false
}

// judgeFile returns why a filesystem call is a forbidden write, or "".
func judgeFile(event Event) string {
	switch {
	case slices.Contains(openCalls, event.Name):
		flags := argument(event, 1)
		if event.Name != "open" {
			flags = argument(event, 2)
		}

		if !writeFlags.MatchString(flags) {
			return ""
		}
	case slices.Contains(pathWriters, event.Name):
	case event.Name == "bind":
		return judgeUnixBind(event)
	default:
		return ""
	}

	names := paths(event)

	// A write that names no path strace could print -- a descriptor-relative call with a NULL
	// path, an unreadable pointer -- cannot be placed, so it is not allowed.
	if len(names) == 0 {
		return event.Name + " with write intent on a path strace could not name"
	}

	for _, name := range names {
		if !underDevOrProc(name) {
			return fmt.Sprintf(
				"%s with write intent on %s, outside /dev and /proc",
				event.Name,
				name,
			)
		}
	}

	return ""
}

var unixPath = regexp.MustCompile(`sun_path="((?:[^"\\]|\\.)*)"`)

// judgeUnixBind treats binding a unix socket to a filesystem path as a write: it creates the node.
// An abstract socket (sun_path=@"...") has no node and is not a file write.
func judgeUnixBind(event Event) string {
	address := argument(event, 1)
	if !strings.Contains(address, "sa_family=AF_UNIX") {
		return ""
	}

	match := unixPath.FindStringSubmatch(address)
	if match == nil {
		return ""
	}

	if !underDevOrProc(match[1]) {
		return "bind creates the socket node " + match[1] + ", outside /dev and /proc"
	}

	return ""
}

// paths returns the filesystem paths a call names, each resolved against the directory descriptor
// before it when it is relative. A relative path with no directory to resolve against comes back
// as is, which underDevOrProc refuses.
func paths(event Event) []string {
	var names []string

	for index, arg := range event.Args {
		unquoted, err := strconv.Unquote(arg)
		if err != nil {
			continue
		}

		if !strings.HasPrefix(unquoted, "/") && index > 0 {
			if dir := ParseDescriptor(event.Args[index-1]); dir.Kind == KindPath {
				unquoted = path.Join(dir.Path, unquoted)
			}
		}

		names = append(names, path.Clean(unquoted))
	}

	return names
}

// underDevOrProc reports whether a path is under /dev or /proc, where a write changes no stored
// state -- except /dev/shm and /dev/mqueue, which are writable tmpfs mounts even on a read-only
// root and which docker diff does not show, so a write there would be stored state no other check
// sees.
func underDevOrProc(name string) bool {
	if !strings.HasPrefix(name, "/") {
		return false
	}

	clean := path.Clean(name)

	for _, stored := range []string{"/dev/shm", "/dev/mqueue"} {
		if clean == stored || strings.HasPrefix(clean, stored+"/") {
			return false
		}
	}

	return clean == "/dev" || clean == "/proc" || strings.HasPrefix(clean, "/dev/") ||
		strings.HasPrefix(clean, "/proc/")
}

func isTCP(descriptor *Descriptor) bool {
	return descriptor.Kind == "TCP" || descriptor.Kind == "TCPv6"
}

// isAcceptedOn reports whether a descriptor is a TCP connection whose local end is the listen
// address: one that was accepted, not dialed.
func isAcceptedOn(descriptor *Descriptor, listen netip.AddrPort) bool {
	if !isTCP(descriptor) || !descriptor.Remote.IsValid() || !descriptor.Local.IsValid() {
		return false
	}

	local := unmapped(descriptor.Local)
	if local.Port() != listen.Port() {
		return false
	}

	return listen.Addr().IsUnspecified() || local.Addr() == listen.Addr().Unmap()
}

func unmapped(address netip.AddrPort) netip.AddrPort {
	return netip.AddrPortFrom(address.Addr().Unmap(), address.Port())
}

func argument(event Event, index int) string {
	if index < len(event.Args) {
		return event.Args[index]
	}

	return ""
}
