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

//! The value types of the configuration and their text syntax (configuration.md section 1,
//! "Value syntax"): sizes, the listen address, CIDRs, origins, durations and the warm-up.

use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;

use jiff::SignedDuration;
use jiff::fmt::friendly::SpanParser;

use go_compat::quote::quote;

use super::gofmt::duration as go_duration;
use super::url;

/// A value that does not parse as its key's type. The text is the rule shown on the problem
/// line, so it names the value and what was expected.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum ValueError {
    /// A size that is not a byte count or a number with one of the size units.
    #[error("invalid size: {0}")]
    Size(String),
    /// A duration that does not parse.
    #[error("invalid duration: {0}")]
    Duration(String),
    /// A `server.listen` value that is not host:port with an empty or IP literal host and a
    /// numeric port.
    #[error("invalid listen address: {0}")]
    Listen(String),
    /// An origin that does not parse as a URL.
    #[error("invalid origin: {0}")]
    Origin(String),
    /// A trusted proxy or a `server.labels` cidr that is not a CIDR with its prefix length.
    #[error("invalid CIDR: {0}")]
    Cidr(String),
}

/// The binary and decimal size units, matched exactly: `kB` is decimal and `KiB` binary, so a
/// guessed spelling such as `KB` or `kib` is an error rather than a silent pick.
const SIZE_UNITS: [(&str, u64); 6] = [
    ("KiB", Size::KIB.0),
    ("MiB", Size::MIB.0),
    ("GiB", Size::GIB.0),
    ("kB", 1_000),
    ("MB", 1_000_000),
    ("GB", 1_000_000_000),
];

/// The largest size: Go's `Size` is an `int64`.
const MAX_SIZE: u64 = i64::MAX.unsigned_abs();

/// A byte count. In the file and the environment it is a plain integer of bytes or a number with
/// a unit, written without a space: `256MiB`, `1.5GiB`, `64kB`. It is never negative and never
/// above `i64::MAX`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Size(u64);

impl Size {
    /// 1 KiB.
    pub const KIB: Self = Self(1 << 10);
    /// 1 MiB.
    pub const MIB: Self = Self(1 << 20);
    /// 1 GiB.
    pub const GIB: Self = Self(1 << 30);

    /// A size of `bytes`.
    #[must_use]
    pub const fn new(bytes: u64) -> Self {
        Self(bytes)
    }

    /// `count` times this size; only for the constants, which never overflow.
    #[must_use]
    pub const fn times(self, count: u64) -> Self {
        Self(self.0.saturating_mul(count))
    }

    /// The size in bytes.
    #[must_use]
    pub const fn bytes(self) -> u64 {
        self.0
    }

    /// A YAML number as a size: whole and not negative only.
    pub(super) fn from_float(number: f64) -> Result<Self, ValueError> {
        // 2^63 is one past the largest size, so the bound is exclusive.
        const LIMIT: f64 = 9_223_372_036_854_775_808.0;
        if number < 0.0 || number.fract() != 0.0 || number >= LIMIT {
            return Err(ValueError::Size(format!(
                "{} is not a whole, non-negative number of bytes",
                go_compat::float::format_g(number)
            )));
        }
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "checked above: whole, not negative and below 2^63"
        )]
        Ok(Self(number as u64))
    }
}

impl FromStr for Size {
    type Err = ValueError;

    /// Parses a size; see [`Size`]. The result must be a whole, non-negative number of bytes
    /// that fits in an `i64`.
    fn from_str(raw: &str) -> Result<Self, ValueError> {
        match SIZE_UNITS
            .iter()
            .find_map(|&(unit, multiplier)| Some((raw.strip_suffix(unit)?, multiplier)))
        {
            Some((number, multiplier)) => scaled_size(raw, number, multiplier),
            None => plain_size(raw),
        }
    }
}

fn plain_size(raw: &str) -> Result<Size, ValueError> {
    if !is_decimal(raw, false) {
        return Err(ValueError::Size(format!(
            "{} is neither a byte count nor a number with KiB, MiB, GiB, kB, MB or GB",
            quote(raw)
        )));
    }
    match raw.parse::<u64>() {
        Ok(bytes) if bytes <= MAX_SIZE => Ok(Size(bytes)),
        Ok(_) | Err(_) => Err(ValueError::Size(format!("{} is too large", quote(raw)))),
    }
}

/// `number` times `multiplier`, exactly: `1.5GiB` is 1610612736 bytes, and a product that is not
/// a whole number of bytes is refused rather than rounded.
fn scaled_size(raw: &str, number: &str, multiplier: u64) -> Result<Size, ValueError> {
    if !is_decimal(number, true) {
        return Err(ValueError::Size(format!(
            "{} does not start with a non-negative number",
            quote(raw)
        )));
    }
    let (whole, fraction) = number.split_once('.').unwrap_or((number, ""));
    let too_large = || ValueError::Size(format!("{} is too large", quote(raw)));
    // The digits as one integer over 10^len(fraction), so the product is exact.
    let digits: u128 = format!("{whole}{fraction}")
        .parse()
        .map_err(|_| too_large())?;
    let scale = u32::try_from(fraction.len())
        .ok()
        .and_then(|length| 10_u128.checked_pow(length))
        .ok_or_else(|| {
            ValueError::Size(format!("{} is not a whole number of bytes", quote(raw)))
        })?;
    let product = digits
        .checked_mul(u128::from(multiplier))
        .ok_or_else(too_large)?;
    if product % scale != 0 {
        return Err(ValueError::Size(format!(
            "{} is not a whole number of bytes",
            quote(raw)
        )));
    }
    u64::try_from(product / scale)
        .ok()
        .filter(|&bytes| bytes <= MAX_SIZE)
        .map(Size)
        .ok_or_else(too_large)
}

/// Whether `text` is digits, optionally with one decimal point between digits. Signs, exponents,
/// spaces and underscores are refused, so only the documented syntax parses.
pub(super) fn is_decimal(text: &str, allow_fraction: bool) -> bool {
    let (whole, fraction) = match text.split_once('.') {
        Some((_, "")) => return false,
        Some(_) if !allow_fraction => return false,
        Some(parts) => parts,
        None => (text, ""),
    };
    !whole.is_empty() && all_digits(whole) && all_digits(fraction)
}

fn all_digits(text: &str) -> bool {
    text.bytes().all(|byte| byte.is_ascii_digit())
}

impl fmt::Display for Size {
    /// The size in the largest binary unit that divides it, as a person would write it:
    /// `256 MiB`, or `1000 bytes`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (unit, suffix) in [(Self::GIB, "GiB"), (Self::MIB, "MiB"), (Self::KIB, "KiB")] {
            if self.0 != 0 && self.0.is_multiple_of(unit.0) {
                return write!(formatter, "{} {suffix}", self.0 / unit.0);
            }
        }
        write!(formatter, "{} bytes", self.0)
    }
}

/// The `server.listen` address: an optional IP literal host and a numeric port. The port's range
/// is a validation rule, not a parse rule, so `:0` and `:70000` parse and then fail validation.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Listen {
    /// The host, empty for every address; an IPv6 literal without its brackets.
    pub host: String,
    /// The port as written; validation keeps it within 1 to 65535.
    pub port: u64,
}

impl FromStr for Listen {
    type Err = ValueError;

    /// Parses host:port, the host empty or an IP literal (an IPv6 one bracketed, a zone
    /// allowed), the port decimal digits.
    fn from_str(text: &str) -> Result<Self, ValueError> {
        let fail = |detail: &str| ValueError::Listen(format!("{}: {detail}", quote(text)));
        let (host, port) = split_host_port(text).map_err(fail)?;
        // Only an IP literal, so neither serve nor the health check ever looks a name up.
        if !host.is_empty() && parse_addr(host).is_none() {
            return Err(fail("the host must be an IP literal or empty"));
        }
        if !is_decimal(port, false) {
            return Err(fail("the port is not a number"));
        }
        let number = port
            .parse::<u64>()
            .ok()
            .filter(|&number| number <= MAX_SIZE)
            .ok_or_else(|| fail("the port is out of range"))?;
        Ok(Self {
            host: host.to_owned(),
            port: number,
        })
    }
}

impl fmt::Display for Listen {
    /// The address in host:port form, an IPv6 host bracketed, as `net.JoinHostPort` writes it.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.host.contains(':') {
            write!(formatter, "[{}]:{}", self.host, self.port)
        } else {
            write!(formatter, "{}:{}", self.host, self.port)
        }
    }
}

/// `net.SplitHostPort`: the host (brackets removed) and the port of host:port.
fn split_host_port(text: &str) -> Result<(&str, &str), &'static str> {
    let colon = text.rfind(':').ok_or("missing port in address")?;
    let (host, port) = (&text[..colon], &text[colon + 1..]);
    if let Some(bracketed) = host.strip_prefix('[') {
        let inner = bracketed
            .strip_suffix(']')
            .ok_or("missing ']' in address")?;
        if inner.contains(['[', ']']) {
            return Err("unexpected '[' or ']' in address");
        }
        return Ok((inner, port));
    }
    if host.contains(':') {
        return Err("too many colons in address");
    }
    if host.contains(['[', ']']) || port.contains(['[', ']']) {
        return Err("unexpected '[' or ']' in address");
    }
    Ok((host, port))
}

/// An IP address as `netip.ParseAddr` reads it: IPv4 in dotted decimal without leading zeros, or
/// IPv6 with an optional non-empty `%zone`. The zone is returned beside the address.
pub(crate) fn parse_addr(text: &str) -> Option<(IpAddr, Option<&str>)> {
    if let Ok(v4) = Ipv4Addr::from_str(text) {
        return Some((IpAddr::V4(v4), None));
    }
    let (address, zone) = match text.split_once('%') {
        Some((_, "")) => return None,
        Some((address, zone)) => (address, Some(zone)),
        None => (text, None),
    };
    // A zone belongs to an IPv6 address only, and std reads only an address without one.
    let v6 = Ipv6Addr::from_str(address).ok()?;
    Some((IpAddr::V6(v6), zone))
}

/// A CIDR: an address and a prefix length, as `netip.ParsePrefix` reads it. Host bits may be set
/// (validation refuses them where they matter); a zone is refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Cidr {
    address: IpAddr,
    bits: u8,
}

/// The value a trusted proxy that did not decode leaves in its list, as Go's decoder leaves a
/// zero value, so the list keeps its length. It is a single unspecified address, which no peer
/// has, and it is never served: a configuration with a decode problem does not start.
pub(super) const PLACEHOLDER_CIDR: Cidr = Cidr {
    address: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
    bits: 32,
};

impl Cidr {
    /// The address as written, host bits included.
    #[must_use]
    pub const fn address(&self) -> IpAddr {
        self.address
    }

    /// The prefix length.
    #[must_use]
    pub const fn bits(&self) -> u8 {
        self.bits
    }

    /// Whether the address is an IPv4-mapped IPv6 one (`::ffff:10.0.0.0`). An IPv4 client is
    /// matched as IPv4, so such a prefix would never match.
    #[must_use]
    pub fn is_ipv4_mapped(&self) -> bool {
        matches!(self.address, IpAddr::V6(v6) if v6.to_ipv4_mapped().is_some())
    }

    /// The prefix with its host bits cleared.
    #[must_use]
    pub fn masked(&self) -> Self {
        let address = match self.address {
            IpAddr::V4(v4) => {
                let mask = u32::MAX.checked_shl(32 - u32::from(self.bits)).unwrap_or(0);
                IpAddr::V4(Ipv4Addr::from(u32::from(v4) & mask))
            }
            IpAddr::V6(v6) => {
                let mask = u128::MAX
                    .checked_shl(128 - u32::from(self.bits))
                    .unwrap_or(0);
                IpAddr::V6(Ipv6Addr::from(u128::from(v6) & mask))
            }
        };
        Self {
            address,
            bits: self.bits,
        }
    }
}

impl Cidr {
    /// Whether `address` is within the prefix, host bits ignored. An IPv4 address never matches
    /// an IPv6 prefix nor the reverse, so an IPv4-mapped address matches only after
    /// [`IpAddr::to_canonical`].
    #[must_use]
    pub fn contains(&self, address: IpAddr) -> bool {
        let candidate = Self {
            address,
            bits: self.bits,
        };
        address.is_ipv4() == self.address.is_ipv4()
            && candidate.masked().address == self.masked().address
    }
}

impl FromStr for Cidr {
    type Err = ValueError;

    fn from_str(text: &str) -> Result<Self, ValueError> {
        let fail = |detail: &str| ValueError::Cidr(format!("{}: {detail}", quote(text)));
        let (address, bits) = text.rsplit_once('/').ok_or_else(|| fail("no '/'"))?;
        let (address, zone) = parse_addr(address).ok_or_else(|| fail("not an IP address"))?;
        if zone.is_some() {
            return Err(fail("IPv6 zones cannot be present in a prefix"));
        }
        // Decimal digits only, without a sign or a leading zero, as netip requires.
        if bits.is_empty() || !all_digits(bits) || (bits.len() > 1 && bits.starts_with('0')) {
            return Err(fail("bad bits after slash"));
        }
        let limit = if address.is_ipv4() { 32 } else { 128 };
        let bits = bits
            .parse::<u8>()
            .ok()
            .filter(|&bits| bits <= limit)
            .ok_or_else(|| fail("prefix length out of range"))?;
        Ok(Self { address, bits })
    }
}

impl fmt::Display for Cidr {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}/{}", self.address, self.bits)
    }
}

/// A URL meant to be an origin (scheme, host, optional port). Parsing only proves it is a URL;
/// whether it is an http or https origin without a path is a validation rule. Empty is unset.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct Origin(String);

impl Origin {
    /// The origin as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether the origin is unset.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl FromStr for Origin {
    type Err = ValueError;

    /// Accepts any text that parses as a URL; the empty string is an unset origin.
    fn from_str(text: &str) -> Result<Self, ValueError> {
        url::parse(text)
            .map(|_| Self(text.to_owned()))
            .map_err(|error| ValueError::Origin(format!("{}: {error}", quote(text))))
    }
}

impl fmt::Display for Origin {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// The `test_defaults.warmup` value: the adaptive warm-up, or a fixed duration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Warmup {
    /// The adaptive warm-up.
    #[default]
    Auto,
    /// A fixed warm-up; validation keeps it within 1 s to 60 s.
    Fixed(SignedDuration),
}

/// The `test_defaults.warmup` value that selects the adaptive warm-up.
const WARMUP_AUTO: &str = "auto";

impl FromStr for Warmup {
    type Err = ValueError;

    /// Parses `auto` or a duration.
    fn from_str(text: &str) -> Result<Self, ValueError> {
        if text == WARMUP_AUTO {
            return Ok(Self::Auto);
        }
        parse_duration(text).map(Self::Fixed).map_err(|_| {
            ValueError::Duration(format!(
                "{} is not a duration such as 500ms, 10s or 2m (or {})",
                quote(text),
                quote(WARMUP_AUTO)
            ))
        })
    }
}

impl fmt::Display for Warmup {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Auto => formatter.write_str(WARMUP_AUTO),
            Self::Fixed(duration) => formatter.write_str(&go_duration(*duration)),
        }
    }
}

/// A duration in jiff's friendly syntax (`500ms`, `10s`, `2m`, `1m30s`); a number without a unit
/// is refused.
pub(super) fn parse_duration(text: &str) -> Result<SignedDuration, ValueError> {
    static PARSER: SpanParser = SpanParser::new();
    PARSER.parse_duration(text).map_err(|_| {
        ValueError::Duration(format!(
            "{} is not a duration such as 500ms, 10s or 2m",
            quote(text)
        ))
    })
}
