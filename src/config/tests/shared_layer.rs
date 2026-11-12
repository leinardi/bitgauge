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

//! Compatibility edges at the shared loader's profile and BitGauge's schema boundary.

#[test]
fn mixed_case_yaml_booleans_keep_their_type() {
    let loaded = super::load("metrics:\n  enabled: tRuE\nlog:\n  level: FaLsE\n", &[]);
    assert!(loaded.config.metrics.enabled);
    assert_eq!(loaded.problems.len(), 1);
    assert_eq!(loaded.problems[0].key, "log.level");
    assert_eq!(loaded.problems[0].rule, "expected text, got a boolean");
}

#[test]
fn literal_dots_in_separated_environment_names_still_nest() {
    let loaded = super::load("", &["BITGAUGE_TEST_DEFAULTS.STREAMS__MAX=7"]);
    assert!(loaded.problems.is_empty(), "{:?}", loaded.problems);
    assert_eq!(loaded.config.test_defaults.streams.max, 7);
}

#[test]
fn repeated_unknown_paths_keep_input_order() {
    let loaded = super::load(
        "",
        &[
            "BITGAUGE_SERVER__unknown=first",
            "BITGAUGE_SERVER__UNKNOWN=second",
            "BITGAUGE_SERVER__UNKNOWN=third",
        ],
    );
    let values: Vec<_> = loaded
        .problems
        .iter()
        .map(|problem| problem.value.as_str())
        .collect();
    assert_eq!(values, ["first", "second", "third"]);
    assert!(
        loaded
            .problems
            .iter()
            .all(|problem| problem.key == "server.unknown")
    );
}

#[test]
fn dots_beside_underscores_do_not_reclassify_log_problems() {
    let loaded = super::load("", &["BITGAUGE_LOG_.LEVEL__X=bad"]);
    assert_eq!(loaded.problems.len(), 1);
    assert_eq!(loaded.problems[0].key, "log_.level.x");
    assert!(!loaded.problems[0].is_log_problem());
}

#[test]
fn equivalent_paths_keep_each_occurrence_in_input_order() {
    let loaded = super::load(
        "",
        &[
            "BITGAUGE_SERVER.UNKNOWN__X=first",
            "BITGAUGE_SERVER__UNKNOWN__X=second",
            "BITGAUGE_SERVER__UNKNOWN.X=first",
        ],
    );
    let values: Vec<_> = loaded
        .problems
        .iter()
        .map(|problem| problem.value.as_str())
        .collect();
    assert_eq!(values, ["first", "second", "first"]);
    assert!(
        loaded
            .problems
            .iter()
            .all(|problem| problem.key == "server.unknown.x")
    );
}

#[test]
fn unicode_environment_keys_lowercase_as_a_whole() {
    for (variable, key) in [("BITGAUGE_A__Σ=bad", "a.ς"), ("BITGAUGE_AΣ__X=bad", "aσ.x")] {
        let loaded = super::load("", &[variable]);
        assert_eq!(loaded.problems.len(), 1, "{variable}");
        assert_eq!(loaded.problems[0].key, key, "{variable}");
    }
}
