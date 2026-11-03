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

//! Go: `preflight_run_test.go`. make harness-preflight.

use std::sync::Arc;

use testenv::harness::preflight::{
    PREFLIGHT_ACCOUNTING, PREFLIGHT_SHAPING, PreflightOptions, check_daemon_cgroups, env_probe,
    first_shaped, preflight, preflight_checks,
};
use testenv::harness::profiles::{Tier, lookup};
use testenv::netguard;
use testenv::runner::{OrFatal as _, Test, TestResult};

use super::{Suite, var};

const ENV_PREFLIGHT: &str = "HARNESS_PREFLIGHT";

/// Go: `TestPreflight`. The checks every runner makes before it starts BitGauge, against the
/// daemon `DOCKER_HOST` names, building only the tools image. Accounting and shaping are
/// separate subtests, each its own probe, so a daemon can pass one and fail the other.
pub(crate) fn test_preflight(test: &Test, suite: &Suite) -> TestResult {
    let (accounting, shaping) = preflight_checks(&var(ENV_PREFLIGHT)).or_fatal(test)?;
    let tools_image = netguard::build_tools_image(&suite.cli, &suite.repo_root).or_fatal(test)?;
    let probe = env_probe(Arc::clone(&suite.provider));

    if accounting {
        test.run(PREFLIGHT_ACCOUNTING, |test| {
            check_daemon_cgroups(&suite.cli).or_fatal(test)?;
            preflight(
                &probe,
                PreflightOptions {
                    tools_image: &tools_image,
                    cgroups: true,
                    shaped: None,
                },
            )
            .or_fatal(test)
        });
    }
    if shaping {
        test.run(PREFLIGHT_SHAPING, |test| {
            let tier = lookup(Tier::Ci.as_str()).or_fatal(test)?;
            let Some(profile) = first_shaped(&tier, false) else {
                return Err(test.fatal("the CI tier shapes no profile"));
            };
            preflight(
                &probe,
                PreflightOptions {
                    tools_image: &tools_image,
                    cgroups: false,
                    shaped: Some(profile),
                },
            )
            .or_fatal(test)
        });
    }
    Ok(())
}
