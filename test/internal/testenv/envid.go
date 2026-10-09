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

package testenv

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	envIDBytes = 4 // 8 hex characters

	// LabelPrefix namespaces every label this package applies.
	LabelPrefix = "io.github.leinardi.bitgauge.test"
	// LabelEnvID names the environment a resource belongs to; cleanup is scoped by it.
	LabelEnvID = LabelPrefix + ".envid"
	// LabelOwner is "<hostname>:<pid>" of the go test process that created the resource.
	LabelOwner = LabelPrefix + ".owner"
	// LabelStarted is when the environment came up, in RFC 3339.
	LabelStarted = LabelPrefix + ".started"
	// LabelKeep is "true" on the marker of an environment kept after a failure.
	LabelKeep = LabelPrefix + ".keep"

	namePrefix = "bitgauge-test-"
)

var errBadOwner = errors.New("owner is not <hostname>:<pid>")

// GenerateEnvID returns a random 8-character hex identifier for one environment.
func GenerateEnvID() (string, error) {
	buf := make([]byte, envIDBytes)

	_, err := rand.Read(buf)
	if err != nil {
		return "", fmt.Errorf("generate env ID: %w", err)
	}

	return hex.EncodeToString(buf), nil
}

// ResourceName returns the name of one resource of an environment: bitgauge-test-<envid>-<base>.
func ResourceName(envID, base string) string {
	return namePrefix + envID + "-" + base
}

// LabelFilter returns the docker --filter value that selects one environment's resources.
func LabelFilter(envID string) string {
	return "label=" + LabelEnvID + "=" + envID
}

// Owner is the process that created an environment.
type Owner struct {
	Host string
	PID  int
}

// String formats the owner as the label value.
func (o Owner) String() string {
	return o.Host + ":" + strconv.Itoa(o.PID)
}

// CurrentOwner returns this process on this host.
func CurrentOwner() (Owner, error) {
	host, err := os.Hostname()
	if err != nil {
		return Owner{}, fmt.Errorf("hostname: %w", err)
	}

	return Owner{Host: host, PID: os.Getpid()}, nil
}

// ParseOwner reads an owner label value. The PID is after the last colon, so a hostname may hold
// colons of its own.
func ParseOwner(value string) (Owner, error) {
	colon := strings.LastIndex(value, ":")
	if colon <= 0 {
		return Owner{}, fmt.Errorf("%w: %q", errBadOwner, value)
	}

	pid, err := strconv.Atoi(value[colon+1:])
	if err != nil || pid <= 0 {
		return Owner{}, fmt.Errorf("%w: %q", errBadOwner, value)
	}

	return Owner{Host: value[:colon], PID: pid}, nil
}
