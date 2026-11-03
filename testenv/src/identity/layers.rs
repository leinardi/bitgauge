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

//! A file as an image's own layers hold it, read from a `docker save` archive rather than
//! through a container, so the identity check compares two independent copies (Go's
//! `imageBinarySHA256` in `test/image`).
//!
//! Two layouts are read. The legacy one, and the one docker 25 and later also write, has a
//! `manifest.json` that lists one image's layer paths in order. A pure OCI layout has only an
//! `index.json`, whose manifest (through any nested index) lists the layer digests, each a
//! `blobs/<algorithm>/<hex>` entry. Either may name an entry that is a symlink to another, as
//! legacy archives do for a shared layer. A layer is a tar, plain or gzipped (detected by its
//! magic bytes, whatever its media type says); zstd is refused.
//!
//! The layers are searched from the last: the first that holds the file wins, as an overlay
//! shows it, and one that whites it out (`.wh.<name>`, or an opaque root) hides every layer
//! below. The archive is untrusted input: the file is bounded at [`MAX_FILE_BYTES`].

use std::collections::HashMap;
use std::fmt;
use std::io::{self, Read};

use flate2::read::GzDecoder;
use serde::Deserialize;

/// The largest file read out of a layer; no build of BitGauge comes close.
pub const MAX_FILE_BYTES: u64 = 256 << 20;

/// Index levels followed before giving up.
const MAX_INDEX_DEPTH: usize = 4;
/// Symlinks followed to an archive entry before giving up.
const MAX_LINKS: usize = 8;

const GZIP_MAGIC: &[u8] = &[0x1f, 0x8b];
const ZSTD_MAGIC: &[u8] = &[0x28, 0xb5, 0x2f, 0xfd];
const WHITEOUT_PREFIX: &str = ".wh.";
const OPAQUE: &str = ".wh..wh..opq";

/// Why an archive cannot be read.
#[derive(Debug)]
pub enum ArchiveError {
    /// The archive or a layer is not a readable tar.
    Tar(io::Error),
    /// The layout is not one this reads.
    Layout(String),
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tar(error) => write!(formatter, "read a tar: {error}"),
            Self::Layout(detail) => formatter.write_str(detail),
        }
    }
}

impl std::error::Error for ArchiveError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Tar(error) => Some(error),
            Self::Layout(_) => None,
        }
    }
}

fn layout(detail: impl Into<String>) -> ArchiveError {
    ArchiveError::Layout(detail.into())
}

/// One entry of the outer archive.
enum Entry {
    File(Vec<u8>),
    Symlink(String),
}

/// An entry path without `./` or `/` in front.
fn normalize(path: &str) -> &str {
    let mut path = path;
    loop {
        if let Some(rest) = path.strip_prefix("./") {
            path = rest;
        } else if let Some(rest) = path.strip_prefix('/') {
            path = rest;
        } else {
            return path;
        }
    }
}

/// Reads every regular file and symlink of the outer archive.
fn read_entries(archive: impl Read) -> Result<HashMap<String, Entry>, ArchiveError> {
    let mut entries = HashMap::new();
    let mut tar = tar::Archive::new(archive);
    for entry in tar.entries().map_err(ArchiveError::Tar)? {
        let mut entry = entry.map_err(ArchiveError::Tar)?;
        let path =
            normalize(&entry.path().map_err(ArchiveError::Tar)?.to_string_lossy()).to_owned();
        let kind = entry.header().entry_type();
        if kind.is_file() {
            let mut content = Vec::new();
            entry.read_to_end(&mut content).map_err(ArchiveError::Tar)?;
            entries.insert(path, Entry::File(content));
        } else if kind.is_symlink() {
            let target = entry
                .link_name()
                .map_err(ArchiveError::Tar)?
                .map(|target| target.to_string_lossy().into_owned())
                .unwrap_or_default();
            entries.insert(path, Entry::Symlink(target));
        }
    }
    Ok(entries)
}

/// The content of the entry at `path`, through its symlinks, which are relative to the
/// directory of the link.
fn resolve<'entries>(
    entries: &'entries HashMap<String, Entry>,
    path: &str,
) -> Result<&'entries [u8], ArchiveError> {
    let mut path = normalize(path).to_owned();
    for _ in 0..=MAX_LINKS {
        match entries.get(&path) {
            Some(Entry::File(content)) => return Ok(content),
            Some(Entry::Symlink(target)) => {
                let dir = path.rsplit_once('/').map_or("", |(dir, _)| dir);
                path = join(dir, target);
            }
            None => return Err(layout(format!("the archive names a missing entry {path}"))),
        }
    }
    Err(layout(format!("too many symlinks to {path}")))
}

/// `target` relative to `dir`, with `.` and `..` resolved.
fn join(dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = if target.starts_with('/') {
        Vec::new()
    } else {
        dir.split('/').filter(|part| !part.is_empty()).collect()
    };
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    parts.join("/")
}

/// The layer paths of the one image in the archive, bottom first.
fn layer_paths(entries: &HashMap<String, Entry>) -> Result<Vec<String>, ArchiveError> {
    if entries.contains_key("manifest.json") {
        return legacy_layers(resolve(entries, "manifest.json")?);
    }
    if entries.contains_key("index.json") {
        return oci_layers(entries);
    }
    Err(layout(
        "neither manifest.json nor index.json is in the archive",
    ))
}

fn legacy_layers(manifest: &[u8]) -> Result<Vec<String>, ArchiveError> {
    #[derive(Deserialize)]
    struct Image {
        #[serde(rename = "Layers")]
        layers: Vec<String>,
    }
    let images: Vec<Image> = serde_json::from_slice(manifest)
        .map_err(|error| layout(format!("read manifest.json: {error}")))?;
    match <[Image; 1]>::try_from(images) {
        Ok([image]) => Ok(image.layers),
        Err(images) => Err(layout(format!(
            "manifest.json lists {} images, want 1",
            images.len()
        ))),
    }
}

#[derive(Deserialize)]
struct Descriptor {
    digest: String,
}

/// An OCI index or image manifest: an index has `manifests`, an image manifest `layers`.
#[derive(Deserialize)]
struct OciDocument {
    #[serde(default)]
    manifests: Option<Vec<Descriptor>>,
    #[serde(default)]
    layers: Option<Vec<Descriptor>>,
}

fn blob_path(digest: &str) -> Result<String, ArchiveError> {
    let (algorithm, hex) = digest
        .split_once(':')
        .ok_or_else(|| layout(format!("unreadable digest {digest:?}")))?;
    Ok(format!("blobs/{algorithm}/{hex}"))
}

fn oci_layers(entries: &HashMap<String, Entry>) -> Result<Vec<String>, ArchiveError> {
    let mut name = "index.json".to_owned();
    for _ in 0..MAX_INDEX_DEPTH {
        let document: OciDocument = serde_json::from_slice(resolve(entries, &name)?)
            .map_err(|error| layout(format!("read {name}: {error}")))?;
        if let Some(layers) = document.layers {
            return layers
                .iter()
                .map(|layer| blob_path(&layer.digest))
                .collect();
        }
        let manifests = document.manifests.unwrap_or_default();
        let [manifest] = &manifests[..] else {
            return Err(layout(format!(
                "{name} lists {} manifests, want 1",
                manifests.len()
            )));
        };
        name = blob_path(&manifest.digest)?;
    }
    Err(layout("the OCI indexes nest too deep"))
}

/// What one layer says about the file.
enum InLayer {
    Holds(Vec<u8>),
    Removes,
    Silent,
}

fn search_layer(layer: &[u8], name: &str) -> Result<InLayer, ArchiveError> {
    if layer.starts_with(ZSTD_MAGIC) {
        return Err(layout("a zstd layer, which this does not read"));
    }
    let source: Box<dyn Read + '_> = if layer.starts_with(GZIP_MAGIC) {
        Box::new(GzDecoder::new(layer))
    } else {
        Box::new(layer)
    };
    let whiteout = format!("{WHITEOUT_PREFIX}{name}");
    let mut found = InLayer::Silent;
    let mut tar = tar::Archive::new(source);
    for entry in tar.entries().map_err(ArchiveError::Tar)? {
        let entry = entry.map_err(ArchiveError::Tar)?;
        let path = entry.path().map_err(ArchiveError::Tar)?;
        let path = normalize(&path.to_string_lossy()).to_owned();
        if path == name {
            if !entry.header().entry_type().is_file() {
                return Err(layout(format!("{name} in a layer is not a regular file")));
            }
            let mut content = Vec::new();
            entry
                .take(MAX_FILE_BYTES + 1)
                .read_to_end(&mut content)
                .map_err(ArchiveError::Tar)?;
            if u64::try_from(content.len()).unwrap_or(u64::MAX) > MAX_FILE_BYTES {
                return Err(layout(format!(
                    "{name} in a layer is over {MAX_FILE_BYTES} bytes"
                )));
            }
            found = InLayer::Holds(content);
        } else if (path == whiteout || path == OPAQUE) && !matches!(found, InLayer::Holds(_)) {
            // A whiteout hides the layers below; the file in this same layer still shows.
            found = InLayer::Removes;
        }
    }
    Ok(found)
}

/// The content of `name`, a path relative to the image root, as the image's layers show it;
/// `None` when no layer holds it or the last that names it removes it.
///
/// # Errors
///
/// The archive, its manifest or a layer cannot be read.
pub fn binary_in_archive(archive: impl Read, name: &str) -> Result<Option<Vec<u8>>, ArchiveError> {
    let entries = read_entries(archive)?;
    let paths = layer_paths(&entries)?;
    for path in paths.iter().rev() {
        match search_layer(resolve(&entries, path)?, name)? {
            InLayer::Holds(content) => return Ok(Some(content)),
            InLayer::Removes => return Ok(None),
            InLayer::Silent => {}
        }
    }
    Ok(None)
}
