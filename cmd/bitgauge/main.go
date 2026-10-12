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

// Command bitgauge is the BitGauge server: serve (the default) runs the speed test, and
// healthcheck asks a running server whether it answers (backend.md sections 5 and 6).
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/logger"
	"github.com/leinardi/bitgauge/internal/ratelimit"
	"github.com/leinardi/bitgauge/internal/server"
)

const (
	commandServe       = "serve"
	commandHealthcheck = "healthcheck"
	// exitFailure is a runtime failure: the listener, or a failed health check.
	exitFailure = 1
	// exitUsage is a command line that cannot be run, like an invalid configuration.
	exitUsage = config.ExitStatusInvalidConfig
)

var errUnknownCommand = errors.New("unknown command")

// options is a parsed command line.
type options struct {
	command    string
	configPath string
	explicit   bool
	help       bool
}

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Environ(), os.Stdout, os.Stderr))
}

// run is main with its inputs and outputs passed in, and the exit status returned.
func run(ctx context.Context, args, environ []string, stdout, stderr io.Writer) int {
	opts, err := parseArgs(args, stderr)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "bitgauge: %v\n", err)
		usage(stderr)

		return exitUsage
	}

	if opts.help {
		usage(stdout)

		return 0
	}

	// A container runtime reserves health check status 2, so a health check that cannot even
	// read its configuration reports plain failure.
	invalidConfig := exitUsage
	if opts.command == commandHealthcheck {
		invalidConfig = exitFailure
	}

	loaded, err := config.LoadFrom(opts.configPath, opts.explicit, environ)
	if err != nil {
		config.StderrLogger(stderr).Error("configuration file", slog.String("error", err.Error()))

		return invalidConfig
	}

	problems := config.Check(&loaded)
	if len(problems) > 0 {
		config.ReportProblems(problems, loaded.Config.Log, stdout, stderr)

		return invalidConfig
	}

	if opts.command == commandHealthcheck {
		return healthcheck(ctx, &loaded.Config)
	}

	return serve(ctx, &loaded, stdout, stderr)
}

// parseArgs reads [serve|healthcheck] [--config path]. Without a command it serves; without
// --config the file is the default path, which may be missing.
func parseArgs(args []string, stderr io.Writer) (options, error) {
	opts := options{command: commandServe, configPath: config.DefaultPath}

	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		opts.command, args = args[0], args[1:]
	}

	if opts.command != commandServe && opts.command != commandHealthcheck {
		return options{}, fmt.Errorf("%w %q", errUnknownCommand, opts.command)
	}

	flags := flag.NewFlagSet("bitgauge "+opts.command, flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(
		&opts.configPath,
		"config",
		config.DefaultPath,
		"path to the YAML configuration file",
	)

	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		return options{help: true}, nil
	}

	if err != nil {
		return options{}, fmt.Errorf("parse the flags: %w", err)
	}

	if flags.NArg() > 0 {
		return options{}, fmt.Errorf("%w %q", errUnknownCommand, flags.Arg(0))
	}

	flags.Visit(func(set *flag.Flag) {
		opts.explicit = opts.explicit || set.Name == "config"
	})

	return opts, nil
}

func usage(out io.Writer) {
	_, _ = fmt.Fprintf(
		out,
		"usage: bitgauge [serve|healthcheck] [--config %s]\n",
		config.DefaultPath,
	)
}

// serve starts the server in the order of backend.md section 5: the configuration is valid by
// now; then the random buffer, the epoch and the grid, the router, and the listener.
func serve(ctx context.Context, loaded *config.Loaded, stdout, stderr io.Writer) int {
	cfg := &loaded.Config

	log, err := logger.NewTo(stdout, cfg.Log.Format, cfg.Log.Level)
	if err != nil {
		// Validation accepted the settings, so this cannot happen; log to stderr regardless.
		log = config.StderrLogger(stderr)
	}

	config.ReportWarnings(log, config.Warnings(cfg))

	if len(loaded.IgnoredEnv) > 0 {
		log.Debug("ignored environment variables without __", slog.Any("names", loaded.IgnoredEnv))
	}

	clock := ratelimit.RealClock{}
	buffer := handlers.NewBuffer()
	epoch := handlers.NewEpoch()
	grid := handlers.NewGrid(clock, epoch.GridOffset)
	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams:        cfg.Limits.MaxStreamsPerClient,
		RequestsPerMinute: cfg.Limits.RequestsPerMinute,
		TrackedClients:    cfg.Limits.TrackedClients,
		MaxFlows:          cfg.Compat.NetworkQuality.MaxFlowsPerClient,
	}, clock)
	sockets := handlers.NewWebSockets(limiter, clock, cfg.Server.CORS.AllowedOrigins,
		handlers.WebSocketIdle, log)

	router, problems := server.NewRouter(cfg, &server.Groups{
		Native: &handlers.Deps{
			Config:     cfg,
			Buffer:     buffer,
			Grid:       grid,
			WebSockets: sockets,
			Build:      buildinfo.Info(),
			Epoch:      epoch,
		},
		Limiter: limiter,
		Log:     log,
	})
	if len(problems) > 0 {
		config.ReportProblems(problems, cfg.Log, stdout, stderr)

		return exitUsage
	}

	httpServer := server.New(cfg, log, &server.Deps{
		Handler: router,
		Deriver: clientip.NewDeriver(cfg.Server.TrustedProxies),
		Clock:   clock,
	})

	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", cfg.Server.Listen.String())
	if err != nil {
		log.Error("listen", slog.String("address", cfg.Server.Listen.String()),
			slog.String("error", err.Error()))

		return exitFailure
	}

	build := buildinfo.Info()
	log.Info("starting",
		slog.String("version", build.Version),
		slog.String("commit", build.Commit),
		slog.String("listen", listener.Addr().String()),
		slog.String("base_path", cfg.Server.BasePath),
		slog.String("compatibility_layers", "none"),
		slog.Bool("metrics", cfg.Metrics.Enabled))
	log.LogAttrs(ctx, slog.LevelInfo, "configuration", config.Effective(cfg)...)

	err = server.Run(ctx, &server.Lifecycle{
		Server:     httpServer,
		Listener:   listener,
		WebSockets: sockets,
		Timers:     clock,
		Log:        log,
	})
	if err != nil {
		log.Error("server stopped", slog.String("error", err.Error()))

		return exitFailure
	}

	return 0
}
