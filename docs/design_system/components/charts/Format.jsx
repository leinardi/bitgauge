// tokens.md "Number formatting" — the one implementation. Production: Intl.NumberFormat with the same rules.
const sig = x => x >= 99.95 ? Math.round(x).toString() : x >= 9.995 ? x.toFixed(1) : x >= 0.9995 ? x.toFixed(2) : x.toPrecision(3);
function scaled(v, U) {
  let i = Math.max(0, Math.min(U.length - 1, Math.floor(Math.log10(Math.max(v, 1)) / 3) - 1)), x = v / Math.pow(10, 3 * (i + 1));
  if (x >= 999.5 && i < U.length - 1) { i++; x /= 1000; }
  return { n: sig(x), u: U[i] };
}
function rate(bps, units) { const b = units === 'bytes'; return scaled(b ? bps / 8 : bps, b ? ['kB/s', 'MB/s', 'GB/s'] : ['kbit/s', 'Mbit/s', 'Gbit/s']); }
const rateStr = (bps, units) => { const r = rate(bps, units); return r.n + ' ' + r.u; };
// Latency / jitter: one decimal below 10 ms, whole ms from 10, "< res" below the timer resolution.
const ms = (v, res = 0.1) => v < res ? '< ' + (res >= 1 ? String(Math.round(res)) : String(+res.toFixed(2))) : res >= 1 || v >= 9.95 ? Math.round(v).toString() : v.toFixed(1);
const bytes = b => { const r = scaled(b, ['kB', 'MB', 'GB', 'TB']); return r.n + ' ' + r.u; };
export const Format = { sig, rate, rateStr, ms, jitter: ms, bytes };
