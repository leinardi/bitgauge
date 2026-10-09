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

// Package syscalltrace reads the output of strace -f -yy and judges it against the image test's
// syscall policies (testing.md section 5): the serve policy, under which bitgauge serve may never
// connect, may send only on the connections it accepted and may write no file outside /dev and
// /proc; and the healthcheck policy, under which bitgauge healthcheck makes exactly one loopback
// connect, to the listen address, and writes no file.
//
// It judges attempts, not outcomes: a refused connect or a failed open fails a trace exactly like
// a successful one. It is untagged and tested on recorded traces, so it runs in every go test.
package syscalltrace

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

var errUnparsable = errors.New("unparsable strace line")

const (
	initialLineBuffer = 64 << 10
	// maxLineLength bounds one line; strace abbreviates buffers, so a real line is far shorter.
	maxLineLength = 16 << 20
)

// Event is one completed system call.
type Event struct {
	// Line is the 1-based line of the trace where the call started.
	Line int
	PID  int
	Name string
	// Args are the call's top-level arguments, exactly as strace printed them.
	Args []string
	// Result is everything after "= ", such as "0", "-1 ENOENT (No such file or directory)" or
	// "5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>".
	Result string
}

func (e Event) String() string {
	return fmt.Sprintf(
		"line %d, pid %d: %s(%s) = %s",
		e.Line,
		e.PID,
		e.Name,
		strings.Join(e.Args, ", "),
		e.Result,
	)
}

var (
	pidPrefix  = regexp.MustCompile(`^(?:\[pid\s+(\d+)\]|(\d+))\s+`)
	callStart  = regexp.MustCompile(`^([a-z_][a-z0-9_]*)\(`)
	resumed    = regexp.MustCompile(`^<\.{3} ([a-z_][a-z0-9_]*) resumed>\s?`)
	unfinished = " <unfinished ...>"
)

type pending struct {
	line int
	name string
	head string
}

// Parse reads a trace written by strace -f -yy (to a file with -o, or to stderr) into the calls it
// records. Signal and exit lines are skipped; a call split by another process's call is joined
// from its unfinished and resumed halves. A line it cannot read is an error, never a skip: a trace
// this package cannot read is a trace it cannot vouch for.
func Parse(reader io.Reader) ([]Event, error) {
	var events []Event

	open := map[int]pending{}

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, initialLineBuffer), maxLineLength)

	number := 0

	for scanner.Scan() {
		number++

		text := scanner.Text()
		if strings.TrimSpace(text) == "" {
			continue
		}

		pid := 0

		if match := pidPrefix.FindStringSubmatch(text); match != nil {
			pid, _ = strconv.Atoi(match[1] + match[2])
			text = text[len(match[0]):]
		}

		if strings.HasPrefix(text, "--- ") || strings.HasPrefix(text, "+++ ") {
			continue
		}

		if head, isUnfinished := strings.CutSuffix(text, unfinished); isUnfinished {
			match := callStart.FindStringSubmatch(head)
			if match == nil {
				return nil, fmt.Errorf("%w %d: %s", errUnparsable, number, text)
			}

			open[pid] = pending{line: number, name: match[1], head: head}

			continue
		}

		line := number

		if match := resumed.FindStringSubmatch(text); match != nil {
			started, ok := open[pid]
			if !ok || started.name != match[1] {
				return nil, fmt.Errorf(
					"%w %d: %s resumed with nothing unfinished",
					errUnparsable,
					number,
					match[1],
				)
			}

			delete(open, pid)

			text = started.head + text[len(match[0]):]
			line = started.line
		}

		event, err := parseCall(text)
		if err != nil {
			return nil, fmt.Errorf("%w %d: %w", errUnparsable, number, err)
		}

		event.Line = line
		event.PID = pid
		events = append(events, event)
	}

	err := scanner.Err()
	if err != nil {
		return nil, fmt.Errorf("read the trace: %w", err)
	}

	// A call still unfinished at the end was interrupted by the process exiting. It was attempted,
	// so it is judged; its result is unknown.
	for pid, started := range open {
		event, parseErr := parseCall(started.head + ") = ?")
		if parseErr != nil {
			return nil, fmt.Errorf("%w %d: %w", errUnparsable, started.line, parseErr)
		}

		event.Line = started.line
		event.PID = pid
		events = append(events, event)
	}

	return events, nil
}

var errMalformedCall = errors.New("malformed call")

// parseCall reads "name(arg, arg, ...) = result".
func parseCall(text string) (Event, error) {
	match := callStart.FindStringSubmatch(text)
	if match == nil {
		return Event{}, fmt.Errorf("%w: %s", errMalformedCall, text)
	}

	body := text[len(match[0]):]

	end, err := closingParen(body)
	if err != nil {
		return Event{}, fmt.Errorf("%w: %s", err, text)
	}

	result, ok := strings.CutPrefix(strings.TrimLeft(body[end+1:], " "), "= ")
	if !ok {
		return Event{}, fmt.Errorf("%w: no result: %s", errMalformedCall, text)
	}

	return Event{
		Name:   match[1],
		Args:   splitArgs(body[:end]),
		Result: strings.TrimSpace(result),
	}, nil
}

// scanner state for the argument grammar: quoted strings, nested brackets, and the <...>
// annotations that -yy attaches to descriptors, which may themselves nest.
type nesting struct {
	quoted  bool
	escaped bool
	depth   int
	angle   int
}

// step advances the state over the byte at index.
func (n *nesting) step(text string, index int) {
	char := text[index]

	switch {
	case n.quoted:
		n.stepQuoted(char)
	case n.angle > 0:
		n.stepAnnotation(text, index)
	case char == '"':
		n.quoted = true
	case char == '<' && index > 0 && opensAnnotation(text[index-1]):
		n.angle++
	case char == '(' || char == '{' || char == '[':
		n.depth++
	case char == ')' || char == '}' || char == ']':
		n.depth--
	}
}

// stepQuoted advances inside a quoted string.
func (n *nesting) stepQuoted(char byte) {
	switch {
	case n.escaped:
		n.escaped = false
	case char == '\\':
		n.escaped = true
	case char == '"':
		n.quoted = false
	}
}

// stepAnnotation advances inside a -yy annotation, which may nest.
func (n *nesting) stepAnnotation(text string, index int) {
	switch {
	case text[index] == '<':
		n.angle++
	// The arrow between a socket's endpoints, 1.2.3.4:5->6.7.8.9:10, closes nothing.
	case text[index] == '>' && text[index-1] != '-':
		n.angle--
	}
}

// opensAnnotation reports whether a '<' after this byte starts a -yy annotation: they follow a
// descriptor number, or the D of AT_FDCWD.
func opensAnnotation(previous byte) bool {
	return (previous >= '0' && previous <= '9') || previous == 'D'
}

func closingParen(body string) (int, error) {
	var state nesting

	for index := range len(body) {
		if !state.quoted && state.angle == 0 && state.depth == 0 && body[index] == ')' {
			return index, nil
		}

		state.step(body, index)
	}

	return 0, fmt.Errorf("%w: unbalanced", errMalformedCall)
}

func splitArgs(body string) []string {
	if strings.TrimSpace(body) == "" {
		return nil
	}

	var (
		args  []string
		state nesting
		start int
	)

	for index := range len(body) {
		if !state.quoted && state.angle == 0 && state.depth == 0 && body[index] == ',' {
			args = append(args, strings.TrimSpace(body[start:index]))
			start = index + 1

			continue
		}

		state.step(body, index)
	}

	return append(args, strings.TrimSpace(body[start:]))
}
