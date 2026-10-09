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
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"syscall"
	"time"
)

const (
	// EnvStaleAfter overrides how old an abandoned environment must be before the sweep removes it.
	EnvStaleAfter = "BITGAUGE_HARNESS_STALE_AFTER"
	// DefaultStaleAfter is the age below which no other environment is ever removed.
	DefaultStaleAfter = 6 * time.Hour
)

// Found is one environment as its labels describe it. Every resource of an environment carries the
// same envid, owner and started labels; keep is set when any of them is the keep marker.
type Found struct {
	ID      string
	Owner   string
	Started string
	Keep    bool
}

// Verdict is the sweep's decision about one environment, with the reason a reader is shown.
type Verdict struct {
	Env    Found
	Remove bool
	Reason string
}

// SweepRules decides which environments are abandoned. Another envid is removed only when all of
// these hold: it is older than StaleAfter, it is not kept, and its owner is provably dead -- on this
// host and its PID does not exist. A foreign host is never assumed dead, and a label that cannot
// be read proves nothing.
type SweepRules struct {
	Now        time.Time
	StaleAfter time.Duration
	Host       string
	// Self is the current envid, which a sweep never touches; Down owns it.
	Self string
	// Alive reports whether a PID exists on this host.
	Alive func(pid int) bool
}

// Decide applies the rules to one environment.
func (r SweepRules) Decide(env Found) Verdict {
	keep := func(reason string) Verdict { return Verdict{Env: env, Reason: reason} }

	if env.ID == r.Self {
		return keep("the current environment")
	}

	if env.Keep {
		return keep("kept after a failure")
	}

	started, err := time.Parse(time.RFC3339, env.Started)
	if err != nil {
		return keep("its started label is unreadable")
	}

	if age := r.Now.Sub(started); age < r.StaleAfter {
		return keep(fmt.Sprintf("started %s ago, under %s", age.Round(time.Minute), r.StaleAfter))
	}

	owner, err := ParseOwner(env.Owner)
	if err != nil {
		return keep("its owner label is unreadable")
	}

	if owner.Host != r.Host {
		return keep("owned by another host, " + owner.Host)
	}

	if r.Alive(owner.PID) {
		return keep(fmt.Sprintf("its owner, PID %d, is still running", owner.PID))
	}

	return Verdict{
		Env:    env,
		Remove: true,
		Reason: fmt.Sprintf("stale, and its owner PID %d is gone", owner.PID),
	}
}

// StaleAfterFromEnv reads BITGAUGE_HARNESS_STALE_AFTER, defaulting to six hours. A value that is
// not a positive duration is an error rather than a default: a typo must not shorten the window.
func StaleAfterFromEnv() (time.Duration, error) {
	raw := os.Getenv(EnvStaleAfter)
	if raw == "" {
		return DefaultStaleAfter, nil
	}

	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf(
			"%w: %s=%q is not a positive duration",
			errBadStaleAfter,
			EnvStaleAfter,
			raw,
		)
	}

	return value, nil
}

var errBadStaleAfter = errors.New("bad stale-after window")

// ProcessAlive reports whether pid exists on this host: signal 0 checks without delivering, and a
// permission error still means the process is there.
func ProcessAlive(pid int) bool {
	err := syscall.Kill(pid, 0)

	return err == nil || errors.Is(err, syscall.EPERM)
}

// DefaultRules returns the sweep rules for this process: now, this host, the configured window and
// a PID check on this host.
func DefaultRules(self string) (SweepRules, error) {
	staleAfter, err := StaleAfterFromEnv()
	if err != nil {
		return SweepRules{}, err
	}

	host, err := os.Hostname()
	if err != nil {
		return SweepRules{}, fmt.Errorf("hostname: %w", err)
	}

	return SweepRules{
		Now:        time.Now(),
		StaleAfter: staleAfter,
		Host:       host,
		Self:       self,
		Alive:      ProcessAlive,
	}, nil
}

// List finds every environment that has a resource on the daemon, from the labels of its
// containers, networks and volumes.
func List(ctx context.Context, runner Runner) ([]Found, error) {
	format := fmt.Sprintf(`{{.Label %q}}|{{.Label %q}}|{{.Label %q}}|{{.Label %q}}`,
		LabelEnvID, LabelOwner, LabelStarted, LabelKeep)
	filter := "label=" + LabelEnvID

	byID := map[string]*Found{}

	for _, list := range [][]string{
		{"ps", "-a", dockerFilter, filter, dockerFormat, format},
		{dockerNetwork, dockerList, dockerFilter, filter, dockerFormat, format},
		{dockerVolume, dockerList, dockerFilter, filter, dockerFormat, format},
	} {
		out, err := runner.Run(ctx, list...)
		if err != nil {
			return nil, fmt.Errorf("list environments: %w", err)
		}

		for line := range strings.SplitSeq(strings.TrimSpace(out), "\n") {
			fields := strings.Split(line, "|")
			if len(fields) != 4 || fields[0] == "" {
				continue
			}

			found, ok := byID[fields[0]]
			if !ok {
				found = &Found{ID: fields[0], Owner: fields[1], Started: fields[2]}
				byID[fields[0]] = found
			}

			found.Keep = found.Keep || fields[3] == "true"
		}
	}

	envs := make([]Found, 0, len(byID))
	for _, found := range byID {
		envs = append(envs, *found)
	}

	slices.SortFunc(envs, func(a, b Found) int { return strings.Compare(a.ID, b.ID) })

	return envs, nil
}

// Sweep removes every environment the rules find abandoned and returns the verdict on each one,
// removed or not, so a caller can list what was kept and why.
func Sweep(ctx context.Context, runner Runner, rules SweepRules) ([]Verdict, error) {
	envs, err := List(ctx, runner)
	if err != nil {
		return nil, err
	}

	verdicts := make([]Verdict, 0, len(envs))

	for _, env := range envs {
		verdict := rules.Decide(env)
		if verdict.Remove {
			err = RemoveEnv(ctx, runner, env.ID)
			if err != nil {
				return verdicts, err
			}
		}

		verdicts = append(verdicts, verdict)
	}

	return verdicts, nil
}
