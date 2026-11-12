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

//! Loading: the file and the environment into the raw tree, then the walker, with a problem for
//! every null, every key that does not decode and every unknown key.

use std::io;
use std::path::{Path, PathBuf};

use config_layer::yaml::{self, Booleans, YamlError};
use config_layer::{EmptyValue, EnvOverlay, ItemTrim, ListSplit, Map, Node, Raw, Unseparated};

use super::decode::{LABEL_KEYS, decode, field, is_section};
use super::{Config, Problem, location};

/// The configuration file read when `--config` is not given. A missing file at this path is not
/// an error (configuration.md section 1).
pub const DEFAULT_PATH: &str = "/etc/bitgauge/config.yaml";

/// The start of every environment variable BitGauge reads.
pub const ENV_PREFIX: &str = "BITGAUGE_";

/// Separates key levels in a variable name; a single underscore stays in a key name.
const ENV_NESTING: &str = "__";
/// Splits a list value given in one variable.
const LIST_SEPARATOR: char = ',';
/// Splits a `server.labels` item of the environment into its cidr and label.
const LABEL_SEPARATOR: char = '=';

const RULE_NULL: &str = "key has no value: write a value or remove the key";
const RULE_UNKNOWN: &str = "unknown key (configuration.md section 2 lists every key)";

/// The decoded configuration and what loading it noticed.
#[derive(Debug, Clone, PartialEq)]
pub struct Loaded {
    /// Every key that decoded; a key that did not keeps its default, so validation does not
    /// report it a second time under another rule.
    pub config: Config,
    /// The keys that could not be decoded: unknown keys, nulls and values that do not parse as
    /// their type, sorted by key. Any problem is fatal (configuration.md section 4).
    pub problems: Vec<Problem>,
    /// The `BITGAUGE_` variables without `__`, which are therefore not configuration keys, such
    /// as Kubernetes service links (configuration.md section 4), sorted. The caller logs them at
    /// debug; their values are never kept.
    pub ignored_env: Vec<String>,
}

/// A configuration file that cannot be loaded at all.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum LoadError {
    /// A file given explicitly with `--config` does not exist.
    #[error("configuration file not found: {}", path.display())]
    FileNotFound {
        /// The path given.
        path: PathBuf,
    },
    /// The file cannot be read or is not valid YAML.
    #[error("cannot read the configuration file {}: {source}", path.display())]
    File {
        /// The path read.
        path: PathBuf,
        /// Why it could not be read.
        source: FileError,
    },
}

/// Why a configuration file could not be read.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum FileError {
    /// Reading it failed.
    #[error(transparent)]
    Io(#[from] io::Error),
    /// It is not valid YAML, holds a duplicate key, or is not a mapping.
    #[error("{0}")]
    Yaml(#[source] Box<YamlError>),
}

/// Reads the configuration from the defaults, the YAML file at `path` and the process
/// environment. `explicit` says whether `path` was given with `--config`: a missing file is an
/// error then, and is skipped at the default path. The error is only for a file that cannot be
/// read; keys that do not decode are listed in [`Loaded::problems`], and nothing is validated
/// yet.
///
/// # Errors
///
/// [`LoadError::FileNotFound`] for a missing explicit file, [`LoadError::File`] for a file that
/// cannot be read or parsed.
pub fn load(path: &Path, explicit: bool) -> Result<Loaded, LoadError> {
    let environment = config_layer::process_environment();
    load_from(path, explicit, &environment)
}

/// [`load`] with the environment given as name and value pairs instead of read from the
/// process, so tests can run in parallel.
///
/// # Errors
///
/// As [`load`].
pub fn load_from(
    path: &Path,
    explicit: bool,
    environment: &[(String, String)],
) -> Result<Loaded, LoadError> {
    let file_error = |source: FileError| LoadError::File {
        path: path.to_owned(),
        source,
    };
    let text = match std::fs::metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            if explicit {
                return Err(LoadError::FileNotFound {
                    path: path.to_owned(),
                });
            }
            String::new()
        }
        Err(error) => return Err(file_error(error.into())),
        Ok(_) => std::fs::read_to_string(path).map_err(|error| file_error(error.into()))?,
    };
    from_text(&text, environment).map_err(|error| file_error(FileError::Yaml(Box::new(error))))
}

/// Loads a configuration from the file's text and the environment.
pub(super) fn from_text(text: &str, environment: &[(String, String)]) -> Result<Loaded, YamlError> {
    let mut tree = yaml::parse(text, Booleans::AnyCase)?;
    let overlay = environment_tree(environment);
    let ignored_env = overlay.ignored;
    let mut problems: Vec<Problem> = overlay
        .unknown
        .into_iter()
        .map(|variable| {
            let key = variable.dotted();
            Problem {
                rule: if is_section(&key) {
                    "expected a mapping, not text"
                } else {
                    RULE_UNKNOWN
                }
                .to_owned(),
                key,
                value: variable.value,
                location: None,
            }
        })
        .collect();
    config_layer::merge(&mut tree, overlay.tree);

    problems.extend(
        config_layer::null_keys(&tree)
            .into_iter()
            .map(|(key, node)| Problem {
                key,
                value: "null".to_owned(),
                rule: RULE_NULL.to_owned(),
                location: location(node),
            }),
    );
    let (config, decode_problems) = decode(&tree);
    problems.extend(decode_problems);
    let mut unknown = Vec::new();
    unknown_keys(&tree, "", &mut unknown);
    problems.extend(unknown.into_iter().map(|(key, node)| Problem {
        key,
        value: node.value.to_string(),
        rule: RULE_UNKNOWN.to_owned(),
        location: location(node),
    }));
    // Stable, so a key's null comes before its decode problem and that before its unknown one.
    problems.sort_by(|left, right| left.key.cmp(&right.key));

    Ok(Loaded {
        config,
        problems,
        ignored_env,
    })
}

/// The environment as a raw tree: `BITGAUGE_SERVER__TRUSTED_PROXIES` is
/// `server.trusted_proxies`, a list key's value is split on commas and trimmed, and a variable
/// without `__` is recorded as ignored. A `server.labels` item is split at its first `=` into a
/// `{cidr, label}` entry; an item without `=` stays text, which the walker refuses.
fn environment_tree(environment: &[(String, String)]) -> config_layer::Overlay {
    // The former loader split the dotted path after replacing __, so literal dots in a
    // separated variable are nesting too. Unseparated service-link variables stay ignored.
    let rules = EnvOverlay::new(ENV_PREFIX, ".", Unseparated::Ignored, |path| {
        field(&path.join(".")).is_some()
    })
    .lists(
        |path| field(&path.join(".")).is_some_and(super::decode::Field::is_list),
        ListSplit::new(LIST_SEPARATOR, ItemTrim::Trimmed, EmptyValue::NoItems),
    );
    let mut overlay = config_layer::Overlay::default();
    for (name, value) in environment {
        let Some(rest) = name.strip_prefix(ENV_PREFIX) else {
            continue;
        };
        if !rest.contains(ENV_NESTING) {
            overlay.ignored.push(name.clone());
            continue;
        }
        let dotted = format!(
            "{ENV_PREFIX}{}",
            rest.replace(ENV_NESTING, ".").to_lowercase()
        );
        // One variable per overlay retains occurrence order for repeated unknown paths;
        // converting __ to dots first cannot regroup underscores beside a literal dot.
        // Lowercase the whole suffix first: Unicode final sigma depends on adjacent segments.
        let variable = rules.overlay([(dotted, value)]);
        config_layer::merge(&mut overlay.tree, variable.tree);
        overlay.unknown.extend(variable.unknown);
    }
    overlay.ignored.sort();
    if let Some(server) = overlay.tree.get_mut("server")
        && let Raw::Map(fields) = &mut server.value
        && let Some(labels) = fields.get_mut("labels")
        && let Raw::List(items) = &mut labels.value
    {
        for item in items {
            if let Raw::Text(value) = &item.value
                && let Some((cidr, label)) = value.split_once(LABEL_SEPARATOR)
            {
                let text = |value: &str| {
                    Node::new(Raw::Text(value.trim().to_owned()), item.origin.clone())
                };
                item.value = Raw::Map(Map::from([
                    ("cidr".to_owned(), text(cidr)),
                    ("label".to_owned(), text(label)),
                ]));
            }
        }
    }
    overlay
}

/// Collects the keys of `map` that match no key or section, with their values, recursing into
/// sections and into the entries of `server.labels`. Each mapping key is matched as one name
/// at its own level, as the walker reads it: a name that holds `.` or `[` (`server.listen`
/// written as one key at the top) is never a key, so it is unknown rather than silently unread.
fn unknown_keys<'tree>(map: &'tree Map, prefix: &str, unknown: &mut Vec<(String, &'tree Node)>) {
    for (name, node) in map {
        let key = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}.{name}")
        };
        if name.contains(['.', '[']) {
            unknown.push((key, node));
        } else if let Some(field) = field(&key) {
            if let (true, Raw::List(entries)) = (field.is_labels(), &node.value) {
                for (index, entry) in entries.iter().enumerate() {
                    if let Raw::Map(fields) = &entry.value {
                        unknown.extend(
                            fields
                                .iter()
                                .filter(|(name, _)| !LABEL_KEYS.contains(&name.as_str()))
                                .map(|(name, field)| (format!("{key}[{index}].{name}"), field)),
                        );
                    }
                }
            }
        } else if is_section(&key) {
            if let Raw::Map(nested) = &node.value {
                unknown_keys(nested, &key, unknown);
            }
        } else {
            unknown.push((key, node));
        }
    }
}
