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

//! What `main` runs, with its inputs passed in: the command line, the configuration, then the
//! health check or the server, started in the order of backend.md section 5. Exit status 0 is a
//! clean stop or a passing check, 2 a command line or configuration that cannot run, and 1
//! anything else: the SPA, the listener, transfers cut at the end of the grace, a failed check,
//! and a health check whose configuration cannot be read, since a container runtime reserves 2.

use std::ffi::OsString;
use std::io::Write as _;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use tokio::runtime::{Builder, Runtime};
use tracing::Dispatch;
use tracing_subscriber::fmt::MakeWriter;

use crate::buildinfo;
use crate::cli::{self, Command, Parsed};
use crate::clientip::{Labeler, Rule};
use crate::clock::TokioClock;
use crate::compat::{librespeed, nq, openspeedtest};
use crate::config::{
    Config, EXIT_INVALID_CONFIG, Loaded, Problem, check, load_from, log_effective, report_problems,
    report_warnings, warnings,
};
use crate::handlers::{
    DrainOptions, Epoch, Grid, Info, Native, RandomSource, UPLOAD_LIFETIME, WEBSOCKET_IDLE,
    WebSockets,
};
use crate::metrics::{Direction, Group as MetricsGroup, Metrics};
use crate::ratelimit::{Limiter, Options};
use crate::server::conn::{self, Lifecycle, Outcome};
use crate::server::router::{Groups, app};
use crate::server::routes::{check_routes, mounted_routes};
use crate::server::signals::{block_shutdown_signals, spawn_signal_thread};
use crate::server::timeouts::Timeouts;
use crate::server::{finish_process, listen};
use crate::web::{RenderError, Spa};
use crate::{healthcheck, logger};

/// How long running transfers may take to finish after the first signal (backend.md section 5).
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);

/// Renders the SPA for a base path: [`Spa::render`] for the embedded one; tests pass a scratch
/// dist, since a checkout that has not built the SPA embeds none.
pub type Render = fn(&str) -> Result<Spa, RenderError>;

/// Where the server runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// The process: SIGTERM and SIGINT blocked and taken by the signal thread, the logger the
    /// global default, a multi-thread runtime.
    Process,
    /// Inside a test: no signals, the logger the default of the one runtime thread, which is
    /// the caller's; `stop` comes from the caller's [`Lifecycle`].
    InProcess,
}

/// What the command reads and writes besides its arguments.
#[derive(Debug, Clone)]
pub struct Process<Out, Err> {
    /// Where the logs and the help go.
    pub stdout: Out,
    /// Where the command-line refusals and a log that cannot be configured go.
    pub stderr: Err,
    /// The environment, as name and value pairs.
    pub environment: Vec<(String, String)>,
    /// Renders the SPA.
    pub render: Render,
    /// Where the server runs.
    pub mode: Mode,
    /// The server's stop and cut.
    pub lifecycle: Lifecycle,
}

/// Runs the command line `args`, the program name excluded, and returns the exit status.
pub fn run<Out, Err>(
    args: impl IntoIterator<Item = OsString>,
    process: Process<Out, Err>,
) -> ExitCode
where
    Out: for<'writer> MakeWriter<'writer> + Clone + Send + Sync + 'static,
    Err: for<'writer> MakeWriter<'writer> + Clone + Send + Sync + 'static,
{
    let options = match cli::parse(args) {
        Ok(Parsed::Run(options)) => options,
        Ok(Parsed::Help(text)) => {
            let _ = process.stdout.make_writer().write_all(text.as_bytes());
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            let _ = writeln!(
                process.stderr.make_writer(),
                "{}",
                error.to_string().trim_end()
            );
            return ExitCode::from(EXIT_INVALID_CONFIG);
        }
    };
    let invalid = if options.command == Command::Healthcheck {
        ExitCode::FAILURE
    } else {
        ExitCode::from(EXIT_INVALID_CONFIG)
    };
    let loaded = match load_from(&options.config, options.explicit, &process.environment) {
        Ok(loaded) => loaded,
        Err(error) => {
            tracing::dispatcher::with_default(&logger::text_to(process.stderr.clone()), || {
                tracing::error!(error = %error, "configuration file");
            });
            return invalid;
        }
    };
    let problems = check(&loaded);
    if !problems.is_empty() {
        report_problems(
            &problems,
            &loaded.config.log,
            process.stdout.clone(),
            process.stderr.clone(),
        );
        return invalid;
    }
    match options.command {
        Command::Healthcheck if healthcheck::answers(&loaded.config) => ExitCode::SUCCESS,
        Command::Healthcheck => ExitCode::FAILURE,
        Command::Serve => serve(&loaded, process),
    }
}

/// The server, from a valid configuration to the end of the process.
fn serve<Out, Err>(loaded: &Loaded, process: Process<Out, Err>) -> ExitCode
where
    Out: for<'writer> MakeWriter<'writer> + Clone + Send + Sync + 'static,
    Err: for<'writer> MakeWriter<'writer> + Clone + Send + Sync + 'static,
{
    let config = &loaded.config;
    // The metrics.path collision is a configuration problem, so it exits 2 before anything else.
    let problems = check_routes(config);
    if !problems.is_empty() {
        report_problems(&problems, &config.log, process.stdout, process.stderr);
        return ExitCode::from(EXIT_INVALID_CONFIG);
    }
    // Validation accepted the settings, so this falls back only in theory.
    let dispatch = logger::to_writer(process.stdout, &config.log.format, &config.log.level)
        .unwrap_or_else(|_| logger::text_to(process.stderr));
    let runtime = match runtime(process.mode, &dispatch, &process.lifecycle) {
        Ok(runtime) => runtime,
        Err(error) => {
            tracing::dispatcher::with_default(&dispatch, || {
                tracing::error!(error = %error, "start the runtime");
            });
            return ExitCode::FAILURE;
        }
    };
    tracing::dispatcher::with_default(&dispatch, || {
        match runtime.block_on(start(loaded, process.render, &process.lifecycle)) {
            Ok(outcome) => finish_process(runtime, &outcome),
            Err(code) => code,
        }
    })
}

/// The runtime of `mode`. In the process, the signals are blocked first, while this is still
/// the only thread, so every thread the runtime starts inherits the mask, and the signal thread
/// is started with the logger already the global default.
fn runtime(mode: Mode, dispatch: &Dispatch, lifecycle: &Lifecycle) -> std::io::Result<Runtime> {
    match mode {
        Mode::Process => {
            block_shutdown_signals()?;
            // Nothing set a global default before, so this cannot fail.
            let _ = tracing_setup::install_global(dispatch.clone());
            spawn_signal_thread(lifecycle.stop_token().clone())?;
            Builder::new_multi_thread().enable_all().build()
        }
        Mode::InProcess => Builder::new_current_thread().enable_all().build(),
    }
}

/// Starts the server and serves until the end of the shutdown: the random buffer, the epoch and
/// the grid, the limiter and the metrics, `index.html`, the router, then the listener.
async fn start(
    loaded: &Loaded,
    render: Render,
    lifecycle: &Lifecycle,
) -> Result<Outcome, ExitCode> {
    let config = &loaded.config;
    report_warnings(&warnings(config));
    if !loaded.ignored_env.is_empty() {
        tracing::debug!(
            names = %format_args!("[{}]", loaded.ignored_env.join(" ")),
            "ignored environment variables without __"
        );
    }
    let failed = |what: &'static str| {
        move |error: &dyn std::error::Error| {
            tracing::error!(error = %error, "{what}");
            ExitCode::FAILURE
        }
    };
    let source = RandomSource::new().map_err(|error| failed("random buffer")(&error))?;
    let epoch = Epoch::new().map_err(|error| failed("epoch")(&error))?;
    let limiter = limiter(config);
    let tracked = limiter.clone();
    // The metrics are collected whether or not metrics.enabled serves them (backend.md
    // section 7).
    let meter = Arc::new(Metrics::new(
        buildinfo::info(),
        move || tracked.tracked_clients(),
        &mounted_routes(config),
    ));
    let spa = render(&config.server.base_path).map_err(|error| failed("render the SPA")(&error))?;
    let groups = groups(
        config,
        Some(Arc::new(spa)),
        (source, epoch),
        &limiter,
        &meter,
        lifecycle,
    );
    let stack = app(config, groups).map_err(|problems| invalid(&problems))?;
    let listener = listen::bind(&config.server.listen).map_err(|error| {
        tracing::error!(address = %config.server.listen, error = %error, "listen");
        ExitCode::FAILURE
    })?;
    let build = buildinfo::info();
    let address = listener.local_addr().map_or_else(
        |_| config.server.listen.to_string(),
        |address| address.to_string(),
    );
    tracing::info!(
        version = build.version,
        commit = build.commit,
        listen = address,
        base_path = config.server.base_path,
        compatibility_layers = compatibility_layers(config),
        metrics = config.metrics.enabled,
        "starting"
    );
    log_effective(config);
    Ok(conn::serve(listener, stack, lifecycle, Timeouts::SERVER, SHUTDOWN_GRACE).await)
}

/// Logs route problems the collision check left, which cannot happen after it passed, and
/// returns the configuration's exit status.
fn invalid(problems: &[Problem]) -> ExitCode {
    for problem in problems {
        tracing::error!(
            key = problem.key.as_str(),
            value = problem.value.as_str(),
            rule = problem.rule.as_str(),
            "invalid configuration"
        );
    }
    ExitCode::from(EXIT_INVALID_CONFIG)
}

/// A validated limit as the limiter counts it; validation keeps every one within range.
fn count(value: i64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// The limiter of `config`'s limits on the server's clock.
pub(crate) fn limiter(config: &Config) -> Limiter {
    Limiter::new(
        Options {
            max_streams: count(config.limits.max_streams_per_client),
            requests_per_minute: count(config.limits.requests_per_minute),
            tracked_clients: usize::try_from(config.limits.tracked_clients).unwrap_or(usize::MAX),
            max_flows: count(config.compat.networkquality.max_flows_per_client),
        },
        TokioClock,
    )
}

/// The route groups for `config`: the native API and the three layers on one random buffer,
/// each group's transfers counted under its own label, and `server.labels` for the info route.
pub(crate) fn groups(
    config: &Config,
    spa: Option<Arc<Spa>>,
    (source, epoch): (RandomSource, Epoch),
    limiter: &Limiter,
    meter: &Arc<Metrics>,
    lifecycle: &Lifecycle,
) -> Groups {
    let transfer = |group, direction| meter.transfer(group, direction);
    let rules: Vec<Rule> = config
        .server
        .labels
        .iter()
        .filter_map(|entry| {
            Some(Rule {
                prefix: entry.cidr?,
                label: entry.label.clone(),
            })
        })
        .collect();
    let native = Native {
        source: source.clone(),
        grid: Grid::new(TokioClock, epoch.grid_offset),
        websockets: WebSockets::new(
            limiter.clone(),
            &config.server.cors.allowed_origins,
            WEBSOCKET_IDLE,
            Arc::clone(meter),
            lifecycle.clone(),
        ),
        info: Arc::new(Info::new(
            config,
            buildinfo::info(),
            &epoch,
            Labeler::new(&rules),
        )),
        epoch,
        max_download_bytes: config.limits.max_download_bytes.bytes(),
        upload: DrainOptions {
            transfer: transfer(MetricsGroup::Api, Direction::Upload),
            limit: config.limits.max_upload_bytes.bytes(),
            lifetime: UPLOAD_LIFETIME,
            require_length: true,
        },
        download: transfer(MetricsGroup::Api, Direction::Download),
        limit: None,
    };
    Groups {
        spa,
        native,
        openspeedtest: openspeedtest::Deps {
            source: source.clone(),
            limit: None,
            download: transfer(MetricsGroup::OpenSpeedTest, Direction::Download),
            upload: transfer(MetricsGroup::OpenSpeedTest, Direction::Upload),
        },
        librespeed: librespeed::Deps {
            source: source.clone(),
            limit: None,
            download: transfer(MetricsGroup::LibreSpeed, Direction::Download),
            upload: transfer(MetricsGroup::LibreSpeed, Direction::Upload),
        },
        nq: nq::Deps {
            source,
            flow_limit: None,
            download: transfer(MetricsGroup::Nq, Direction::Download),
            upload: transfer(MetricsGroup::Nq, Direction::Upload),
        },
        limiter: limiter.clone(),
        meter: Arc::clone(meter),
        endpoint: Some(Arc::clone(meter)),
    }
}

/// The startup line's list of the enabled compatibility layers, by their configuration names,
/// or `none` (configuration-security.md section 6).
#[must_use]
pub fn compatibility_layers(config: &Config) -> String {
    let layers: Vec<&str> = [
        ("openspeedtest", config.compat.openspeedtest.enabled),
        ("librespeed", config.compat.librespeed.enabled),
        ("networkquality", config.compat.networkquality.enabled),
    ]
    .into_iter()
    .filter_map(|(name, enabled)| enabled.then_some(name))
    .collect();
    if layers.is_empty() {
        "none".to_owned()
    } else {
        layers.join(",")
    }
}

#[cfg(test)]
mod tests;
