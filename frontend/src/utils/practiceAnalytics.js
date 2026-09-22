// Formatting + period-math helpers for the Practice Analytics page.
//
// Indian grouping is wide (₹1,19,750), so every figure that can grow past a
// lakh has a compact form available. Decide once here, not at each call site.
//
// Period is always a plain { year, month } object (month is 1-12), never a
// date string — trailingMonths()'s own "YYYY-MM" keys look exactly like a
// parseable date, and new Date("2026-09") parses as UTC midnight, which
// rolls back a day (and a month) in any timezone behind UTC. Passing a
// structured object instead of a string removes that failure mode entirely
// rather than relying on everyone remembering to parse it "correctly".

const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * formatINR(119750)                    -> "₹1,19,750"
 * formatINR(119750, { compact: true }) -> "₹1.2L"
 * Compact kicks in at 1,000 and switches unit at a lakh and a crore.
 */
export function formatINR(value, { compact = false } = {}) {
  const n = Number(value) || 0;
  if (!compact) return inr0.format(n);

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
  return inr0.format(n);
}

// One decimal, but never a trailing ".0" — ₹1.2L and ₹5L, not ₹5.0L.
function trim(n) {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatCount(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "September 2026" — the label on the period picker. Plain array lookup,
 * not Intl/Date — a period is already a (year, month) pair, so there's
 * nothing to parse or convert. */
export function formatPeriod({ year, month }) {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** "this month" / "in August" — for copy that reads naturally either way
 * depending on whether `period` is the current real month or a past one. */
export function periodLabel({ year, month }, { capitalize = false } = {}) {
  const today = new Date();
  const isCurrent = year === today.getFullYear() && month === today.getMonth() + 1;
  const label = isCurrent ? "this month" : `in ${MONTHS_LONG[month - 1]}`;
  return capitalize ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

/** "21 Sep 2026" — generated-on stamp in the PDF header. Takes a real Date
 * instance (e.g. `new Date()`), never a string. */
export function formatDay(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The trailing 12 months ending in (and including) the selected period.
 * Returns [{ key: "2025-10", label: "Oct", year: 2025 }, ...] oldest first,
 * so charts can align API rows to a fixed 12-slot axis instead of trusting
 * the API to return empty months.
 *
 * `new Date(year, month - 1, 1)` here is safe in a way `new Date(string)`
 * is not: numeric-argument Date() always constructs local midnight for the
 * exact (year, month, day) given, with no UTC-parsing step to shift it —
 * we only ever read year()/month() back off it, never format it for
 * display, so there's no timezone-dependent output to get wrong.
 */
export function trailingMonths({ year, month }, count = 12) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS[d.getMonth()],
      year: d.getFullYear(),
    });
  }
  return out;
}

/** The last `count` (year, month) pairs ending at `period`, newest first —
 * for the period picker's <select> options. Same numeric-Date safety as
 * trailingMonths(). */
export function recentPeriods({ year, month }, count = 24) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month - 1 - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

/**
 * Fills a fixed 12-slot axis from sparse API rows keyed "YYYY-MM".
 * byKey: { "2026-08": { collected: 100000, outstanding: 19750 } }
 */
export function alignToMonths(months, byKey, empty = {}) {
  return months.map((m) => ({ ...m, ...empty, ...(byKey?.[m.key] ?? {}) }));
}

/** First/last calendar day of a period, as "YYYY-MM-DD" — for handing off
 * to the existing /api/analytics/export endpoint's custom date range. */
export function periodBounds({ year, month }) {
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}
