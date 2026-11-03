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

//! One profile's topology over the docker CLI (testing.md section 5.1; Go's `topology.go`): an
//! internal network with no route out; the netguard holder owning BitGauge's namespace, which
//! BitGauge (read-only) and the iperf3 server join; an optional proxy; the Playwright client,
//! whose namespace the shaper sidecar shares and shapes; and on a Compat profile the
//! `OpenSpeedTest` UI. The settings and the pure pieces are in [`super::topology`]; the
//! compatibility step is [`Topology::compat`].
//!
//! Go ran the ping and the self-test's iperf3 in goroutines under a context; here they run on
//! scoped threads, and each bounded docker command carries its own timeout, which kills the
//! docker CLI as Go's context did.

use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use super::continuous::{CONTINUOUS_BROWSER, continuous_browse_limit, continuous_export};
use super::images::{CADDY_IMAGE, OPEN_SPEED_TEST_IMAGE, PLAYWRIGHT_IMAGE, TRAEFIK_IMAGE};
use super::ping::artifacts_for;
use super::profiles::{Profile, Proxy};
use super::report::{Throughput, create_dir};
use super::shaper::{
    OFFLOAD_COMMAND, caps_offload, iperf3_length, iperf3_settle, loss_command,
    received_bits_per_second, shaper_commands, tbf_sent_bytes,
};
use super::topology::{
    BROWSER_LIMIT, CLIENT_OUT, CLIENT_WEB, Config, IPERF3_PORT, LISTEN_PORT, OPENSPEEDTEST_PORT,
    PING_INTERVAL, POLL_INTERVAL, POLL_LIMIT, SELF_TEST_FOR, SELF_TEST_TAIL,
    SHAPER_SELF_TEST_FAILED, bind_mount, check_self_test, iperf3_seconds, tbf_rate,
};
use super::usage::{CGROUP_CPU_STAT, CGROUP_MEMORY_PEAK, cpu_usage_micros, memory_peak};
use crate::env::Env;
use crate::netguard::{self, Guard, Options};

/// One profile's containers. Built by [`up`]; the environment's cleanup removes them.
pub struct Topology {
    pub(super) env: Env,
    pub(super) cfg: Config,
    pub(super) profile: Profile,
    guard: Guard,
    network: String,
    pub(super) client: String,
    pub(super) shaper: String,
    /// The proxy's container, empty without one.
    pub(super) proxy: String,
    /// The `OpenSpeedTest` UI's container on a Compat profile, empty otherwise.
    pub(super) openspeedtest: String,
    /// The measurement the shaper self-test judged.
    self_test: Option<Throughput>,
    /// Where the browser opens BitGauge, through the proxy when there is one.
    pub url: String,
}

/// Builds the topology for one profile. A failed step returns its error; the environment's
/// cleanup removes whatever was created. Once netguard has started, a failed bring-up still
/// returns the partial topology, so the run can read the guard's counters and whatever
/// self-test was measured; before that, it returns none.
pub fn up(env: &Env, cfg: &Config, profile: &Profile) -> (Option<Topology>, Result<(), String>) {
    let network = env.name("net");
    if let Err(error) = env.docker(&["network", "create", "--internal", &network]) {
        return (None, Err(format!("create the network: {error}")));
    }
    let guard = match netguard::start(
        env,
        &Options {
            tools_image: cfg.tools_image.clone(),
            network: network.clone(),
            listen_port: LISTEN_PORT,
            without_sink_routes: false,
        },
    ) {
        Ok(guard) => guard,
        Err(error) => return (None, Err(format!("start netguard: {error}"))),
    };
    let mut topology = Topology {
        env: env.clone(),
        cfg: cfg.clone(),
        profile: profile.clone(),
        guard,
        network,
        client: String::new(),
        shaper: String::new(),
        proxy: String::new(),
        openspeedtest: String::new(),
        self_test: None,
        url: String::new(),
    };
    let result = topology.bring_up();
    (Some(topology), result)
}

impl Topology {
    fn bring_up(&mut self) -> Result<(), String> {
        self.start_bitgauge()?;
        self.start_iperf3_server()?;
        self.start_proxy()?;
        self.start_client()?;
        self.start_shaper()?;
        self.trust_proxy_ca()?;
        self.start_openspeedtest()
    }

    /// The netguard holder whose counters the run reads at the end.
    #[must_use]
    pub const fn guard(&self) -> &Guard {
        &self.guard
    }

    /// Whether this run shapes the client's link.
    #[must_use]
    pub const fn shaped(&self) -> bool {
        self.profile.shaped && !self.cfg.unshaped
    }

    /// The tbf rates the shaper self-test measured, `None` on an unshaped run or when the
    /// self-test never measured.
    #[must_use]
    pub const fn self_test(&self) -> Option<Throughput> {
        self.self_test
    }

    /// The profile this topology runs.
    #[must_use]
    pub const fn profile(&self) -> &Profile {
        &self.profile
    }

    /// Reads the client container's cgroup: total CPU time in microseconds and the memory peak in
    /// bytes.
    ///
    /// # Errors
    ///
    /// A file cannot be read or parsed.
    pub fn client_counters(&self) -> Result<(u64, u64), String> {
        let cpu_stat = self
            .exec(&self.client, &["cat", CGROUP_CPU_STAT])
            .map_err(|error| format!("read the client's cpu.stat: {error}"))?;
        let cpu_micros = cpu_usage_micros(&cpu_stat)?;
        let peak = self
            .exec(&self.client, &["cat", CGROUP_MEMORY_PEAK])
            .map_err(|error| format!("read the client's memory.peak: {error}"))?;
        Ok((cpu_micros, memory_peak(&peak)?))
    }

    /// Measures the client's path to the iperf3 server beside BitGauge, upload then download,
    /// each for `duration` after the settle the result leaves out ([`iperf3_settle`]), with blocks
    /// sized to the profile's rate ([`iperf3_length`]); the receiver's intervals give the rate.
    ///
    /// # Errors
    ///
    /// iperf3 failed or printed what does not parse.
    pub fn iperf3(&self, duration: Duration) -> Result<Throughput, String> {
        // An unshaped run has neither the profile's round trip nor its rate.
        let (rate, rtt) = if self.shaped() {
            (self.profile.rate_bits_per_second, self.profile.rtt)
        } else {
            (0, Duration::ZERO)
        };
        let settle = iperf3_settle(rtt);
        let seconds = iperf3_seconds(settle + duration).to_string();
        let length = iperf3_length(rate).to_string();
        let mut result = Throughput {
            seconds: duration.as_secs_f64(),
            ..Throughput::default()
        };
        for reverse in [false, true] {
            let mut args = vec![
                "iperf3",
                "--client",
                &self.guard.name,
                "--port",
                IPERF3_PORT,
                "--time",
                &seconds,
                "--length",
                &length,
                "--get-server-output",
                "--json",
            ];
            if reverse {
                args.push("--reverse");
            }
            let out = self
                .exec(&self.shaper, &args)
                .map_err(|error| format!("iperf3: {error}"))?;
            let received = received_bits_per_second(&out, reverse, settle)
                .map_err(|error| error.to_string())?;
            if reverse {
                result.download_bits_per_second = received;
            } else {
                result.upload_bits_per_second = received;
            }
        }
        Ok(result)
    }

    /// Runs one browser through the preset with the harness driver, with an ICMP ping to the
    /// server running alongside from the client's namespace. The driver writes the export and its
    /// phase transitions into [`artifacts_for`]'s paths; this returns the ping's full output,
    /// each reply with its wall-clock time (`-D`), which the loaded-latency rule places in those
    /// phases, with the browser run's outcome.
    pub fn browse(&self, browser: &str) -> (String, Result<(), String>) {
        let artifacts = artifacts_for(&self.profile.name, browser);
        let export_dir = parent(&artifacts.export);
        let deadline = BROWSER_LIMIT.as_secs().to_string();
        thread::scope(|scope| {
            let ping = scope.spawn(|| {
                // ping's exit status does not matter: its output is the record.
                self.env
                    .output(
                        &[
                            "exec",
                            &self.shaper,
                            "ping",
                            "-D",
                            "-i",
                            PING_INTERVAL,
                            "-w",
                            &deadline,
                            &self.guard.name,
                        ],
                        None,
                    )
                    .map(|output| output.stdout)
                    .unwrap_or_default()
            });
            let result = self.playwright(
                "harness/run.spec.ts",
                browser,
                &[
                    format!("HARNESS_PRESET={}", self.profile.preset.as_str()),
                    format!("HARNESS_EXPORT_DIR={CLIENT_OUT}/{export_dir}"),
                    format!(
                        "HARNESS_OUTPUT_DIR={CLIENT_OUT}/playwright/{}-{browser}",
                        self.profile.name
                    ),
                ],
            );
            // SIGINT makes ping print its summary and exit; the thread then returns its output.
            let _ = self.exec(&self.shaper, &["pkill", "-INT", "ping"]);
            let ping = ping.join().unwrap_or_default();
            (
                ping,
                result.map_err(|error| format!("the {browser} run: {error}")),
            )
        })
    }

    /// Runs the Continuous memory check's browser driver in Chromium for `minutes`:
    /// `web/harness/continuous.spec.ts` samples the engine Worker's heap and writes
    /// [`continuous_export`], within [`continuous_browse_limit`] rather than the tiers' limit.
    ///
    /// # Errors
    ///
    /// The browser run failed.
    pub fn continuous(&self, minutes: i64) -> Result<(), String> {
        let export = continuous_export();
        let export_dir = parent(&export);
        self.playwright_within(
            continuous_browse_limit(minutes),
            "harness/continuous.spec.ts",
            CONTINUOUS_BROWSER,
            &[
                format!("HARNESS_CONTINUOUS_MINUTES={minutes}"),
                format!("HARNESS_EXPORT_DIR={CLIENT_OUT}/{export_dir}"),
                format!(
                    "HARNESS_OUTPUT_DIR={CLIENT_OUT}/playwright/{}-continuous",
                    self.profile.name
                ),
            ],
        )
        .map_err(|error| format!("the continuous run: {error}"))
    }

    /// Runs one harness spec, selected by Playwright's file filter, in one browser in the client,
    /// with the BitGauge URL and the variables given, within the tiers' browser limit; the Caddy
    /// profile's browser accepts Caddy's internal CA.
    pub(super) fn playwright(
        &self,
        spec: &str,
        browser: &str,
        env: &[String],
    ) -> Result<(), String> {
        self.playwright_within(BROWSER_LIMIT, spec, browser, env)
    }

    fn playwright_within(
        &self,
        limit: Duration,
        spec: &str,
        browser: &str,
        env: &[String],
    ) -> Result<(), String> {
        let ignore_https = if self.profile.proxy.https() { "1" } else { "0" };
        let mut variables = vec![
            format!("BITGAUGE_HARNESS_URL={}", self.url),
            format!("HARNESS_IGNORE_HTTPS_ERRORS={ignore_https}"),
        ];
        variables.extend_from_slice(env);
        let mut args = vec!["exec"];
        for variable in &variables {
            args.extend(["--env", variable.as_str()]);
        }
        // The file filter goes before the options: --project takes every value that follows it.
        args.extend([
            self.client.as_str(),
            "npx",
            "--no-install",
            "playwright",
            "test",
            spec,
            "--config",
            "playwright.harness.config.ts",
            "--project",
            browser,
        ]);
        self.env
            .docker_timeout(&args, Some(limit))
            .map(drop)
            .map_err(|error| format!("playwright {spec}: {error}"))
    }

    /// Starts the image under test read-only in the guard's namespace, with the profile's
    /// environment; on a Compat profile that names the network's subnets as trusted proxies.
    fn start_bitgauge(&self) -> Result<(), String> {
        let mut subnets = Vec::new();
        if self.profile.compat {
            let out = self
                .env
                .docker(&[
                    "network",
                    "inspect",
                    "--format",
                    "{{range .IPAM.Config}}{{.Subnet}} {{end}}",
                    &self.network,
                ])
                .map_err(|error| format!("read the network's subnets: {error}"))?;
            subnets = out.split_whitespace().map(str::to_owned).collect();
            if subnets.is_empty() {
                return Err(format!("the network has no subnet: {}", self.network));
            }
        }
        let name = self.env.name("bitgauge");
        let network_mode = self.guard.network_mode();
        let variables = self.profile.bitgauge_env(&subnets);
        let mut args = vec![
            "run",
            "--detach",
            "--name",
            &name,
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            &network_mode,
        ];
        for variable in &variables {
            args.extend(["--env", variable.as_str()]);
        }
        args.push(&self.cfg.bitgauge_image);
        self.env
            .docker(&args)
            .map_err(|error| format!("start BitGauge: {error}"))?;

        // Up only once it answers, from inside its own namespace.
        let info = format!("http://127.0.0.1:{LISTEN_PORT}/api/v1/info");
        poll(|| {
            self.guard
                .exec(&["wget", "-q", "-O", "/dev/null", &info])
                .map(drop)
                .map_err(|error| format!("probe /api/v1/info: {error}"))
        })
    }

    /// Joins the guard's namespace, so the reference measures the same endpoint the browser does.
    /// It reports in JSON, which `--get-server-output` hands to the client for upload.
    fn start_iperf3_server(&self) -> Result<(), String> {
        let name = self.env.name("iperf3");
        let network_mode = self.guard.network_mode();
        self.env
            .docker(&[
                "run",
                "--detach",
                "--name",
                &name,
                "--cap-drop",
                "ALL",
                "--network",
                &network_mode,
                &self.cfg.tools_image,
                "iperf3",
                "--server",
                "--port",
                IPERF3_PORT,
                "--json",
            ])
            .map(drop)
            .map_err(|error| format!("start the iperf3 server: {error}"))
    }

    fn start_proxy(&mut self) -> Result<(), String> {
        let upstream = format!("http://{}:{LISTEN_PORT}", self.guard.name);
        let proxy = self.env.name("proxy");
        let configs = self.cfg.repo_root.join("test/harness/proxies");
        let upstream_env = format!("BITGAUGE_UPSTREAM={upstream}");
        match self.profile.proxy {
            Proxy::None => {
                self.url = upstream;
                return Ok(());
            }
            Proxy::Traefik => {
                let static_config = bind_mount(
                    &display(&configs.join("traefik/traefik.yaml")),
                    "/etc/traefik/traefik.yaml",
                    true,
                );
                let dynamic_config = bind_mount(
                    &display(&configs.join("traefik/dynamic.yaml")),
                    "/etc/traefik/dynamic.yaml",
                    true,
                );
                self.env
                    .docker(&[
                        "run",
                        "--detach",
                        "--name",
                        &proxy,
                        "--network",
                        &self.network,
                        "--cap-drop",
                        "ALL",
                        "--env",
                        &upstream_env,
                        "--mount",
                        &static_config,
                        "--mount",
                        &dynamic_config,
                        TRAEFIK_IMAGE,
                    ])
                    .map_err(|error| format!("start Traefik: {error}"))?;
                let port = if self.profile.websocket_blocked {
                    "8082"
                } else {
                    "8081"
                };
                self.url = format!("http://{proxy}:{port}");
            }
            Proxy::Caddy => {
                let host_env = format!("BITGAUGE_PROXY_HOST={proxy}");
                let caddyfile = bind_mount(
                    &display(&configs.join("caddy/Caddyfile")),
                    "/etc/caddy/Caddyfile",
                    true,
                );
                self.env
                    .docker(&[
                        "run",
                        "--detach",
                        "--name",
                        &proxy,
                        "--network",
                        &self.network,
                        "--cap-drop",
                        "ALL",
                        "--cap-add",
                        "NET_BIND_SERVICE",
                        "--env",
                        &upstream_env,
                        "--env",
                        &host_env,
                        "--mount",
                        &caddyfile,
                        CADDY_IMAGE,
                    ])
                    .map_err(|error| format!("start Caddy: {error}"))?;
                self.url = format!("https://{proxy}:8443");
            }
        }
        self.proxy = proxy;
        Ok(())
    }

    /// Starts the pinned `OpenSpeedTest` UI on the network, on a Compat profile only, and waits
    /// until the shaper, in the client's namespace, loads its page. It serves the UI alone: the
    /// browser points it at BitGauge with `?Host=`.
    fn start_openspeedtest(&mut self) -> Result<(), String> {
        if !self.profile.compat {
            return Ok(());
        }
        self.openspeedtest = self.env.name("openspeedtest");
        self.env
            .docker(&[
                "run",
                "--detach",
                "--name",
                &self.openspeedtest,
                "--network",
                &self.network,
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                OPEN_SPEED_TEST_IMAGE,
            ])
            .map_err(|error| format!("start the OpenSpeedTest UI: {error}"))?;
        let url = self.openspeedtest_url();
        poll(|| {
            self.exec(&self.shaper, &["wget", "-q", "-O", "/dev/null", &url])
                .map(drop)
                .map_err(|error| format!("probe the OpenSpeedTest UI: {error}"))
        })
    }

    /// The `OpenSpeedTest` UI's page on its HTTP port.
    pub(super) fn openspeedtest_url(&self) -> String {
        format!("http://{}:{OPENSPEEDTEST_PORT}", self.openspeedtest)
    }

    /// Starts the Playwright image idle, so the shaper can join and shape its namespace before
    /// the browser makes a single request. `web/` is mounted read-only from the host, with the
    /// `node_modules` npm ci installed there: the client has no route out to install anything.
    fn start_client(&mut self) -> Result<(), String> {
        self.client = self.env.name("client");
        let (uid, gid) = current_ids()?;
        let user = format!("{uid}:{gid}");
        let web = bind_mount(&display(&self.cfg.repo_root.join("web")), CLIENT_WEB, true);
        let out = bind_mount(&display(&self.cfg.out_dir), CLIENT_OUT, false);
        self.env
            .docker(&[
                "run",
                "--detach",
                "--name",
                &self.client,
                "--network",
                &self.network,
                // Its own cgroup at /sys/fs/cgroup, which client_counters reads, whatever the
                // daemon's default namespace mode; the preflight probes the same mode.
                "--cgroupns",
                "private",
                "--cap-drop",
                "ALL",
                "--user",
                &user,
                "--env",
                "HOME=/tmp",
                "--mount",
                &web,
                "--mount",
                &out,
                "--workdir",
                CLIENT_WEB,
                PLAYWRIGHT_IMAGE,
                "sleep",
                "infinity",
            ])
            .map(drop)
            .map_err(|error| format!("start the client: {error}"))
    }

    /// Shapes the client's link: netem delay with a tbf child on egress, and the same tbf on an
    /// ifb device that ingress is mirrored to; the self-test runs on that link, then netem gains
    /// the profile's loss. Every tc command must succeed; there is never a silently unshaped run.
    fn start_shaper(&mut self) -> Result<(), String> {
        self.shaper = self.env.name("shaper");
        let client_network = format!("container:{}", self.client);
        // The shaper also runs the iperf3 client and the ping, from the client's namespace, so
        // they take the browser's path.
        self.env
            .docker(&[
                "run",
                "--detach",
                "--name",
                &self.shaper,
                "--network",
                &client_network,
                "--cap-drop",
                "ALL",
                "--cap-add",
                "NET_ADMIN",
                "--cap-add",
                "NET_RAW",
                &self.cfg.tools_image,
                "sleep",
                "infinity",
            ])
            .map_err(|error| format!("start the shaper: {error}"))?;
        if !self.shaped() {
            return Ok(());
        }
        for command in shaper_commands(&self.profile) {
            let words: Vec<&str> = command.split_whitespace().collect();
            self.exec(&self.shaper, &words)
                .map_err(|error| format!("shape the link ({command}): {error}"))?;
        }
        self.cap_sender_offload()?;
        self.check_shaper()?;
        let loss = loss_command(&self.profile);
        if loss.is_empty() {
            return Ok(());
        }
        let words: Vec<&str> = loss.split_whitespace().collect();
        self.exec(&self.shaper, &words)
            .map(drop)
            .map_err(|error| format!("add the loss ({loss}): {error}"))
    }

    /// Runs [`OFFLOAD_COMMAND`], where [`caps_offload`] holds, in the namespace that sends to the
    /// client: BitGauge's, through the netguard holder, or the proxy's, through a one-shot tools
    /// container joining it, since the proxies run without `NET_ADMIN`. A connection takes the cap
    /// when it opens, and every connection of the run opens after this.
    fn cap_sender_offload(&self) -> Result<(), String> {
        if !caps_offload(&self.profile) {
            return Ok(());
        }
        let command: Vec<&str> = OFFLOAD_COMMAND.split_whitespace().collect();
        if self.proxy.is_empty() {
            return self
                .exec(&self.guard.name, &command)
                .map(drop)
                .map_err(|error| {
                    format!("cap BitGauge's segmentation offload ({OFFLOAD_COMMAND}): {error}")
                });
        }
        let proxy_network = format!("container:{}", self.proxy);
        let mut args = vec![
            "run",
            "--rm",
            "--network",
            &proxy_network,
            "--cap-drop",
            "ALL",
            "--cap-add",
            "NET_ADMIN",
            &self.cfg.tools_image,
        ];
        args.extend(command);
        self.env.docker(&args).map(drop).map_err(|error| {
            format!("cap the proxy's segmentation offload ({OFFLOAD_COMMAND}): {error}")
        })
    }

    /// The shaper self-test (testing.md section 5.1): before any loss is added, it reads the rate
    /// each direction's tbf sends while iperf3 saturates that direction, and refuses a profile
    /// whose rate is off the configured one by more than the bound. The eth0 tbf meters upload,
    /// the ifb0 tbf download.
    fn check_shaper(&mut self) -> Result<(), String> {
        let upload = self
            .tbf_rate("eth0", false)
            .map_err(|error| format!("{SHAPER_SELF_TEST_FAILED}: {error}"))?;
        let download = self
            .tbf_rate("ifb0", true)
            .map_err(|error| format!("{SHAPER_SELF_TEST_FAILED}: {error}"))?;
        self.self_test = Some(Throughput {
            download_bits_per_second: download,
            upload_bits_per_second: upload,
            seconds: SELF_TEST_FOR.as_secs_f64(),
        });
        check_self_test(self.profile.rate_bits_per_second, download, upload).map(drop)
    }

    /// Runs iperf3 in one direction and reads the bytes the device's tbf sends over the
    /// self-test's span, from the settle on, while iperf3 keeps the link saturated. Each read is
    /// timed at the middle of its tc call. A failed read still waits for iperf3 to end, which
    /// its `--time` bounds.
    fn tbf_rate(&self, device: &str, reverse: bool) -> Result<f64, String> {
        let settle = iperf3_settle(self.profile.rtt);
        let seconds = iperf3_seconds(settle + SELF_TEST_FOR + SELF_TEST_TAIL).to_string();
        let length = iperf3_length(self.profile.rate_bits_per_second).to_string();
        let mut args = vec![
            "iperf3",
            "--client",
            &self.guard.name,
            "--port",
            IPERF3_PORT,
            "--time",
            &seconds,
            "--length",
            &length,
        ];
        if reverse {
            args.push("--reverse");
        }
        thread::scope(|scope| {
            let iperf3 = scope.spawn(|| self.exec(&self.shaper, &args));
            let (first, first_at) = self.tbf_sent_after(device, settle)?;
            let (last, last_at) =
                self.tbf_sent_after(device, SELF_TEST_FOR.saturating_sub(first_at.elapsed()))?;
            iperf3
                .join()
                .unwrap_or_else(|_| Err("the iperf3 thread panicked".to_owned()))
                .map_err(|error| format!("iperf3: {error}"))?;
            Ok(tbf_rate(
                first,
                last,
                last_at.duration_since(first_at).as_secs_f64(),
            ))
        })
    }

    /// Waits, then reads the bytes the device's tbf has sent and when.
    fn tbf_sent_after(&self, device: &str, wait: Duration) -> Result<(i64, Instant), String> {
        thread::sleep(wait);
        let before = Instant::now();
        let out = self.exec(&self.shaper, &["tc", "-s", "qdisc", "show", "dev", device])?;
        let read_at = before + before.elapsed() / 2;
        let sent = tbf_sent_bytes(&out).map_err(|error| error.to_string())?;
        Ok((sent, read_at))
    }

    /// Runs a command in one of the topology's containers.
    pub(super) fn exec(&self, container: &str, command: &[&str]) -> Result<String, String> {
        let mut args = vec!["exec", container];
        args.extend_from_slice(command);
        self.env
            .docker(&args)
            .map_err(|error| format!("exec in {container}: {error}"))
    }

    /// [`Topology::exec`] within `limit`.
    pub(super) fn exec_within(
        &self,
        limit: Duration,
        container: &str,
        command: &[&str],
    ) -> Result<String, String> {
        let mut args = vec!["exec", container];
        args.extend_from_slice(command);
        self.env
            .docker_timeout(&args, Some(limit))
            .map_err(|error| format!("exec in {container}: {error}"))
    }
}

/// Retries `check` every [`POLL_INTERVAL`] for up to [`POLL_LIMIT`].
fn poll(mut check: impl FnMut() -> Result<(), String>) -> Result<(), String> {
    let deadline = Instant::now() + POLL_LIMIT;
    loop {
        match check() {
            Ok(()) => return Ok(()),
            Err(error) if Instant::now() > deadline => {
                return Err(format!("still failing after a minute: {error}"));
            }
            Err(_) => thread::sleep(POLL_INTERVAL),
        }
    }
}

/// The directory part of a slash-separated relative path.
fn parent(path: &str) -> &str {
    path.rsplit_once('/').map_or(".", |(dir, _)| dir)
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// The real user and group IDs of this process, as Go's `os.Getuid` and `os.Getgid`, read from
/// `/proc/self/status` since the crate has no libc binding.
fn current_ids() -> Result<(u32, u32), String> {
    let status = fs::read_to_string("/proc/self/status")
        .map_err(|error| format!("read /proc/self/status: {error}"))?;
    let real = |key: &str| -> Result<u32, String> {
        status
            .lines()
            .find_map(|line| line.strip_prefix(key))
            .and_then(|rest| rest.split_whitespace().next())
            .and_then(|id| id.parse().ok())
            .ok_or_else(|| format!("no {key} line in /proc/self/status"))
    };
    Ok((real("Uid:")?, real("Gid:")?))
}

/// Makes the report directory absolute and creates its `exports` and `playwright` directories
/// now, as the user running the harness: the client bind-mounts them and writes as that user,
/// and a missing bind source would be created root-owned by the daemon.
///
/// # Errors
///
/// The path cannot be made absolute or a directory cannot be created.
pub fn report_dir(path: &Path) -> Result<PathBuf, String> {
    let dir = std::path::absolute(path)
        .map_err(|error| format!("make {} absolute: {error}", path.display()))?;
    for sub in ["exports", "playwright"] {
        create_dir(&dir.join(sub))?;
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::evaluate::COUNTER_NAMES;

    /// Go: `TestCounterNamesFollowNetguard`. The evaluator's counter names are netguard's own.
    #[test]
    fn counter_names_follow_netguard() {
        assert_eq!(COUNTER_NAMES, netguard::COUNTERS);
    }

    #[test]
    fn helpers() {
        use std::os::unix::fs::MetadataExt as _;

        assert_eq!(parent("exports/ci-1m/chromium.json"), "exports/ci-1m");
        assert_eq!(parent("file"), ".");
        let (uid, gid) = current_ids().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let report = report_dir(&dir.path().join("ci-x")).unwrap();
        assert!(report.join("exports").is_dir() && report.join("playwright").is_dir());
        let meta = fs::metadata(&report).unwrap();
        assert_eq!((meta.uid(), meta.gid()), (uid, gid));
    }
}
