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

//! Go: `continuous_test.go`. The manual Continuous memory check, make harness-continuous.

use std::sync::{Arc, Mutex, PoisonError};

use jiff::Timestamp;
use testenv::env::Env;
use testenv::envid::generate_env_id;
use testenv::harness::bringup::{report_dir, up};
use testenv::harness::continuous::{
    CONTINUOUS_BROWSER, CONTINUOUS_PROFILE, ContinuousReport, continuous_dir, continuous_export,
    continuous_minutes,
};
use testenv::harness::gofmt;
use testenv::harness::profiles::{Profile, Tier, lookup, select};
use testenv::harness::report::Status;
use testenv::harness::topology::Config;
use testenv::runner::{OrFatal as _, Test, TestResult};

use super::{EGRESS, Suite, dist_harness, join, prepare_images, run_env, var};

/// How long the check samples, which `.mk/harness.mk` passes in.
const ENV_CONTINUOUS_MINUTES: &str = "HARNESS_CONTINUOUS_MINUTES";

/// Go: `TestHarnessContinuous`. make harness-continuous, the manual Continuous memory check of
/// testing.md section 5: a Continuous download on the Continuous profile in Chromium, on a fresh
/// topology, whose Worker heap samples are judged and written to the report under dist/harness.
/// A run that fails, or could not complete, fails it.
pub(crate) fn test_harness_continuous(test: &Test, suite: &Suite) -> TestResult {
    let minutes = continuous_minutes(&var(ENV_CONTINUOUS_MINUTES)).or_fatal(test)?;
    let tier = lookup(Tier::Ci.as_str()).or_fatal(test)?;
    let spec = select(&tier, CONTINUOUS_PROFILE, CONTINUOUS_BROWSER).or_fatal(test)?;
    let Some(profile) = spec.profiles.first() else {
        return Err(test.fatal(format!("the CI tier has no {CONTINUOUS_PROFILE}")));
    };
    let (tools_image, image, started) = prepare_images(test, suite, false, Some(profile))?;
    let report_env = generate_env_id().or_fatal(test)?;
    let dir =
        report_dir(&continuous_dir(&dist_harness(suite), started, &report_env)).or_fatal(test)?;
    let report = Arc::new(Mutex::new(ContinuousReport::new(
        minutes,
        &report_env,
        started,
    )));
    {
        let report = Arc::clone(&report);
        let dir = dir.clone();
        test.cleanup(move |test| {
            let mut report = report.lock().unwrap_or_else(PoisonError::into_inner);
            report.finished = Timestamp::now();
            if let Err(error) = report.write(&dir) {
                test.error(error);
            }
            test.log(format!("report: {}", dir.display()));
        });
    }

    let cfg = Config {
        tools_image,
        bitgauge_image: image,
        repo_root: suite.repo_root.clone(),
        out_dir: dir.clone(),
        unshaped: false,
    };
    test.run(&format!("{}/{CONTINUOUS_BROWSER}", profile.name), |test| {
        let env = run_env(test)?;
        let mut report = report.lock().unwrap_or_else(PoisonError::into_inner);
        report.run_env_id.clone_from(&env.id);
        if let Err(error) = measure_continuous(&env, &cfg, profile, minutes, &mut report) {
            report.error = error;
        }
        report.judge_file(&dir.join(continuous_export()));
        if report.status != Status::Pass {
            test.error(&report.verdict);
        }
        Ok(())
    });
    Ok(())
}

/// Brings up the profile's topology, its shaper self-tested, runs the browser driver for the
/// minutes given, and reads netguard's counters whatever happened once BitGauge could have
/// started.
fn measure_continuous(
    env: &Env,
    cfg: &Config,
    profile: &Profile,
    minutes: i64,
    report: &mut ContinuousReport,
) -> Result<(), String> {
    let (topology, result) = up(env, cfg, profile);
    let Some(topology) = topology else {
        return result;
    };
    report.self_test = topology.self_test();
    let result = result.and_then(|()| topology.continuous(minutes));
    let counters = match topology.guard().counters() {
        Ok(counters) => counters,
        Err(error) => {
            return join([
                result.err(),
                Some(format!("read the netguard counters: {error}")),
            ]);
        }
    };
    report.egress = Some(counters.0.clone());
    let egress = (!counters.zero()).then(|| format!("{EGRESS}: {}", gofmt::counters(&counters.0)));
    join([result.err(), egress])
}
