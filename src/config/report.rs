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

//! The configuration's log lines: one error per problem (configuration-security.md section 2),
//! one warning per suspicious setting (section 4), and the effective configuration at startup
//! (section 6).

use tracing::callsite::{DefaultCallsite, Identifier};
use tracing::field::{FieldSet, Value, display};
use tracing::metadata::Kind;
use tracing::{Dispatch, Event, Level, Metadata};
use tracing_subscriber::fmt::MakeWriter;

use super::decode::FIELDS;
use super::effective::{EffectiveValue, effective};
use super::{Config, Log, Problem};
use crate::logger;

const PROBLEM_MESSAGE: &str = "invalid configuration";
const WARNING_MESSAGE: &str = "suspicious configuration";
const EFFECTIVE_MESSAGE: &str = "configuration";

/// Logs every problem as one error line with `key`, `value` and `rule` fields, through a logger
/// built from the configured log settings on `stdout`. When those settings are themselves
/// invalid, the lines are written as text to `stderr` instead (configuration-security.md
/// section 2): that covers a log key with a problem of its own, whose decoded value is only the
/// default it kept. The caller then exits with [`super::EXIT_INVALID_CONFIG`].
pub fn report_problems<Out, Err>(problems: &[Problem], settings: &Log, stdout: Out, stderr: Err)
where
    Out: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
    Err: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    let configured = logger::to_writer(stdout, &settings.format, &settings.level);
    let dispatch = match configured {
        Ok(dispatch) if !problems.iter().any(Problem::is_log_problem) => dispatch,
        Ok(_) | Err(_) => logger::text_to(stderr),
    };
    tracing::dispatcher::with_default(&dispatch, || {
        for problem in problems {
            tracing::error!(
                key = problem.key.as_str(),
                value = problem.value.as_str(),
                rule = problem.rule.as_str(),
                "{PROBLEM_MESSAGE}"
            );
        }
    });
}

/// Logs every warning at warn with `key`, `value` and `rule` fields, through the current
/// logger.
pub fn report_warnings(warnings: &[Problem]) {
    for warning in warnings {
        tracing::warn!(
            key = warning.key.as_str(),
            value = warning.value.as_str(),
            rule = warning.rule.as_str(),
            "{WARNING_MESSAGE}"
        );
    }
}

/// The field names of the startup line: the message, then every key in the table's order.
const EFFECTIVE_FIELDS: [&str; FIELDS.len() + 1] = {
    let mut names = [""; FIELDS.len() + 1];
    names[0] = "message";
    let mut index = 0;
    while index < FIELDS.len() {
        names[index + 1] = FIELDS[index].key;
        index += 1;
    }
    names
};

static EFFECTIVE_NAMES: [&str; FIELDS.len() + 1] = EFFECTIVE_FIELDS;

/// The startup line's callsite. tracing's macros name their fields in the source, and this
/// line has one field per key of the table, which no macro call can spell, so its callsite is
/// declared here the way they declare theirs.
static EFFECTIVE_CALLSITE: DefaultCallsite = DefaultCallsite::new(&EFFECTIVE_METADATA);
static EFFECTIVE_METADATA: Metadata<'static> = Metadata::new(
    EFFECTIVE_MESSAGE,
    module_path!(),
    Level::INFO,
    Some(file!()),
    Some(line!()),
    Some(module_path!()),
    FieldSet::new(&EFFECTIVE_NAMES, Identifier(&EFFECTIVE_CALLSITE)),
    Kind::EVENT,
);

/// A value of the startup line as tracing records it: text as text, sizes in bytes, a list as
/// its items in brackets.
enum Rendered {
    Text(String),
    Int(i64),
    Bytes(u64),
    Float(f64),
    Bool(bool),
}

impl Rendered {
    fn new(value: EffectiveValue) -> Self {
        match value {
            EffectiveValue::Text(text) => Self::Text(text),
            EffectiveValue::Int(number) => Self::Int(number),
            EffectiveValue::Float(number) => Self::Float(number),
            EffectiveValue::Bool(flag) => Self::Bool(flag),
            EffectiveValue::Size(size) => Self::Bytes(size.bytes()),
            EffectiveValue::List(items) => Self::Text(format!("[{}]", items.join(" "))),
        }
    }

    fn as_value(&self) -> &dyn Value {
        match self {
            Self::Text(text) => text,
            Self::Int(number) => number,
            Self::Bytes(number) => number,
            Self::Float(number) => number,
            Self::Bool(flag) => flag,
        }
    }
}

/// Logs the effective configuration at info, one field per key in key order, through the
/// current logger. Nothing in it is secret (configuration-security.md section 6).
pub fn log_effective(config: &Config) {
    let interest = EFFECTIVE_CALLSITE.interest();
    if interest.is_never()
        || !tracing::dispatcher::get_default(|dispatch: &Dispatch| {
            dispatch.enabled(&EFFECTIVE_METADATA)
        })
    {
        return;
    }
    let rendered: Vec<Rendered> = effective(config)
        .into_iter()
        .map(|(_, value)| Rendered::new(value))
        .collect();
    let message = display(EFFECTIVE_MESSAGE);
    let values: Vec<Option<&dyn Value>> = std::iter::once(Some(&message as &dyn Value))
        .chain(rendered.iter().map(|value| Some(value.as_value())))
        .collect();
    Event::dispatch(
        &EFFECTIVE_METADATA,
        &EFFECTIVE_METADATA.fields().value_set_all(&values),
    );
}
