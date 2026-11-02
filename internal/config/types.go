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

package config

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"net"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Binary and decimal size units (configuration.md section 1, "Value syntax").
const (
	KiB      Size = 1 << 10
	MiB      Size = 1 << 20
	GiB      Size = 1 << 30
	Kilobyte Size = 1000
	Megabyte Size = 1000 * Kilobyte
	Gigabyte Size = 1000 * Megabyte
)

// warmupAuto is the test_defaults.warmup value that selects the adaptive warm-up.
const warmupAuto = "auto"

var (
	// ErrSize is wrapped by every size that does not parse.
	ErrSize = errors.New("invalid size")
	// ErrDuration is wrapped by every duration that does not parse.
	ErrDuration = errors.New("invalid duration")
	// ErrListen is wrapped by a server.listen value that is not host:port with an empty or IP
	// literal host and a numeric port.
	ErrListen = errors.New("invalid listen address")
	// ErrOrigin is wrapped by an origin that does not parse as a URL.
	ErrOrigin = errors.New("invalid origin")
	// ErrPrefix is wrapped by a trusted proxy or a server.labels cidr that is not a CIDR with
	// its prefix length.
	ErrPrefix = errors.New("invalid CIDR")
)

// sizeUnits maps each accepted unit suffix to its multiplier. Matching is exact: kB is decimal
// and KiB binary, so a guessed spelling such as KB or kib is an error rather than a silent pick.
var sizeUnits = map[string]Size{
	"KiB": KiB,
	"MiB": MiB,
	"GiB": GiB,
	"kB":  Kilobyte,
	"MB":  Megabyte,
	"GB":  Gigabyte,
}

// Size is a byte count. In the file and the environment it is a plain integer of bytes or a
// number with one of the units of sizeUnits, written without a space: 256MiB, 1.5GiB, 64kB.
type Size int64

// UnmarshalText parses a size; see Size.
func (s *Size) UnmarshalText(text []byte) error {
	parsed, err := ParseSize(string(text))
	if err != nil {
		return err
	}

	*s = parsed

	return nil
}

// ParseSize parses a size; see Size. The result must be a whole, non-negative number of bytes
// that fits in an int64.
func ParseSize(raw string) (Size, error) {
	number, multiplier := raw, Size(1)

	for unit, unitSize := range sizeUnits {
		trimmed, found := strings.CutSuffix(raw, unit)
		if found {
			number, multiplier = trimmed, unitSize

			break
		}
	}

	if multiplier == 1 {
		return parsePlainSize(raw)
	}

	return parseScaledSize(raw, number, multiplier)
}

func parsePlainSize(raw string) (Size, error) {
	if !isDecimal(raw, false) {
		return 0, fmt.Errorf(
			"%w: %q is neither a byte count nor a number with KiB, MiB, GiB, kB, MB or GB",
			ErrSize,
			raw,
		)
	}

	bytes, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: %q: %w", ErrSize, raw, err)
	}

	return Size(bytes), nil
}

func parseScaledSize(raw, number string, multiplier Size) (Size, error) {
	if !isDecimal(number, true) {
		return 0, fmt.Errorf("%w: %q does not start with a non-negative number", ErrSize, raw)
	}

	value, ok := new(big.Rat).SetString(number)
	if !ok {
		return 0, fmt.Errorf("%w: %q does not start with a non-negative number", ErrSize, raw)
	}

	value.Mul(value, new(big.Rat).SetInt64(int64(multiplier)))

	if !value.IsInt() {
		return 0, fmt.Errorf("%w: %q is not a whole number of bytes", ErrSize, raw)
	}

	if !value.Num().IsInt64() {
		return 0, fmt.Errorf("%w: %q is too large", ErrSize, raw)
	}

	return Size(value.Num().Int64()), nil
}

// isDecimal reports whether text is digits, optionally with one decimal point between digits.
// Signs, exponents, spaces and underscores are refused so that only the documented syntax parses.
func isDecimal(text string, allowFraction bool) bool {
	whole, fraction, hasPoint := strings.Cut(text, ".")
	if hasPoint && (!allowFraction || fraction == "") {
		return false
	}

	return whole != "" && allDigits(whole) && allDigits(fraction)
}

func allDigits(text string) bool {
	for _, char := range text {
		if char < '0' || char > '9' {
			return false
		}
	}

	return true
}

// String renders a size in the largest binary unit that divides it, as a person would write it.
func (s Size) String() string {
	for _, unit := range []struct {
		size   Size
		suffix string
	}{{GiB, "GiB"}, {MiB, "MiB"}, {KiB, "KiB"}} {
		if s != 0 && s%unit.size == 0 {
			return fmt.Sprintf("%d %s", s/unit.size, unit.suffix)
		}
	}

	return fmt.Sprintf("%d bytes", int64(s))
}

// sizeFromNumber converts a YAML number to a Size: whole and non-negative only.
func sizeFromNumber(number float64) (Size, error) {
	// float64(math.MaxInt64) is 2^63, one past the largest int64, so the bound is exclusive.
	if number < 0 || number != math.Trunc(number) || number >= math.MaxInt64 {
		return 0, fmt.Errorf("%w: %v is not a whole, non-negative number of bytes", ErrSize, number)
	}

	return Size(number), nil
}

// Listen is the server.listen address: an optional host and a numeric port. Its range is
// checked by validation, not here.
type Listen struct {
	Host string
	Port int
}

// UnmarshalText parses host:port, the host empty or an IP literal (an IPv6 one bracketed).
func (l *Listen) UnmarshalText(text []byte) error {
	host, port, err := net.SplitHostPort(string(text))
	if err != nil {
		return fmt.Errorf("%w: %q: %w", ErrListen, text, err)
	}

	// Only an IP literal, so neither serve nor the health check ever looks a name up.
	if host != "" {
		_, err = netip.ParseAddr(host)
		if err != nil {
			return fmt.Errorf("%w: %q: the host must be an IP literal or empty", ErrListen, text)
		}
	}

	if !isDecimal(port, false) {
		return fmt.Errorf("%w: %q: the port is not a number", ErrListen, text)
	}

	number, err := strconv.Atoi(port)
	if err != nil {
		return fmt.Errorf("%w: %q: %w", ErrListen, text, err)
	}

	*l = Listen{Host: host, Port: number}

	return nil
}

// String returns the address in host:port form, as net.Listen takes it.
func (l Listen) String() string {
	return net.JoinHostPort(l.Host, strconv.Itoa(l.Port))
}

// OptionalDuration is a duration that may be left empty. Empty means "the preset's value", so
// Set is false; it is never read as zero.
type OptionalDuration struct {
	Duration time.Duration
	Set      bool
}

// UnmarshalText parses Go duration syntax (500ms, 10s, 2m), or the empty string for unset.
func (d *OptionalDuration) UnmarshalText(text []byte) error {
	if len(text) == 0 {
		*d = OptionalDuration{}

		return nil
	}

	duration, err := parseDuration(string(text))
	if err != nil {
		return err
	}

	*d = OptionalDuration{Duration: duration, Set: true}

	return nil
}

// Warmup is test_defaults.warmup: auto, or a fixed duration.
type Warmup struct {
	Auto     bool
	Duration time.Duration
}

// UnmarshalText parses auto or a Go duration.
func (w *Warmup) UnmarshalText(text []byte) error {
	if string(text) == warmupAuto {
		*w = Warmup{Auto: true}

		return nil
	}

	duration, err := parseDuration(string(text))
	if err != nil {
		return fmt.Errorf("%w (or %q)", err, warmupAuto)
	}

	*w = Warmup{Duration: duration}

	return nil
}

func parseDuration(raw string) (time.Duration, error) {
	duration, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf(
			"%w: %q is not a Go duration such as 500ms, 10s or 2m",
			ErrDuration,
			raw,
		)
	}

	return duration, nil
}

// Origin is a URL meant to be an origin (scheme, host, optional port). Parsing only proves it is
// a URL; whether it is an http or https origin without a path is a validation rule.
type Origin string

// UnmarshalText accepts any text that parses as a URL; the empty string is an unset origin.
func (o *Origin) UnmarshalText(text []byte) error {
	_, err := url.Parse(string(text))
	if err != nil {
		return fmt.Errorf("%w: %q: %w", ErrOrigin, text, err)
	}

	*o = Origin(text)

	return nil
}
