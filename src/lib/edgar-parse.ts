/**
 * Pure helpers for turning SEC XBRL "companyfacts" data into clean annual and
 * quarterly series. No network access here, so everything is unit-testable.
 *
 * Background: 10-Q cash-flow statements report year-to-date (YTD) totals, not the
 * quarter alone. A Q2 cash-flow number covers Jan 1 to Jun 30. To get the
 * quarter-only value we subtract the prior YTD value with the same start date
 * (Q2 = H1 - Q1, Q3 = 9M - H1, Q4 = FY - 9M). Values derived this way are flagged.
 */

export interface RawFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

export interface Point {
  /** Period start (duration facts only). */
  start?: string;
  /** Period end / balance-sheet date. */
  end: string;
  val: number;
  /** Accession number of the filing the value came from. */
  accn: string;
  form: string;
  filed: string;
  /** True when the value was computed by subtracting two YTD figures. */
  derived?: boolean;
}

const PERIODIC_FORMS = new Set(["10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"]);

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Keep one value per (start, end) period from periodic reports. When a period is
 * reported in several filings (e.g. prior-year comparatives), keep the most
 * recently filed value, which reflects any restatement.
 */
export function dedupeFacts(facts: RawFact[]): Point[] {
  const best = new Map<string, RawFact>();
  for (const f of facts) {
    if (!PERIODIC_FORMS.has(f.form) || !Number.isFinite(f.val)) continue;
    const key = `${f.start ?? ""}|${f.end}`;
    const prev = best.get(key);
    if (!prev || f.filed > prev.filed) best.set(key, f);
  }
  return [...best.values()]
    .map(({ start, end, val, accn, form, filed }) => ({ start, end, val, accn, form, filed }))
    .sort((a, b) => (a.end === b.end ? (a.start ?? "").localeCompare(b.start ?? "") : a.end.localeCompare(b.end)));
}

const isQuarterLength = (d: number) => d >= 80 && d <= 100;
const isYearLength = (d: number) => d >= 350 && d <= 380;

/** Fiscal-year (≈365 day) values, one per period end. */
export function annualDurations(points: Point[]): Point[] {
  return points.filter((p) => p.start && isYearLength(daysBetween(p.start, p.end)));
}

/**
 * Quarter-only values for a duration concept. Uses a reported 3-month value when
 * one exists; otherwise derives it from consecutive YTD values sharing a start date.
 */
export function quarterlyDurations(points: Point[]): Point[] {
  const withStart = points.filter((p) => p.start) as (Point & { start: string })[];
  const ends = [...new Set(withStart.map((p) => p.end))].sort();
  const out: Point[] = [];
  for (const end of ends) {
    const atEnd = withStart.filter((p) => p.end === end);
    const direct = atEnd.find((p) => isQuarterLength(daysBetween(p.start, p.end)));
    if (direct) {
      out.push(direct);
      continue;
    }
    // Longest YTD value ending here (up to one year), then the YTD value one quarter earlier.
    const ytd = atEnd
      .filter((p) => daysBetween(p.start, p.end) <= 380)
      .sort((a, b) => daysBetween(b.start, b.end) - daysBetween(a.start, a.end))[0];
    if (!ytd) continue;
    const prior = withStart.find(
      (p) => p.start === ytd.start && isQuarterLength(daysBetween(p.end, ytd.end)),
    );
    if (!prior) continue;
    out.push({
      start: prior.end,
      end: ytd.end,
      val: ytd.val - prior.val,
      accn: ytd.accn,
      form: ytd.form,
      filed: ytd.filed,
      derived: true,
    });
  }
  return out;
}

/** Balance-sheet (instant) values, one per date. */
export function instants(points: Point[]): Point[] {
  const byEnd = new Map<string, Point>();
  for (const p of points) {
    if (p.start) continue;
    const prev = byEnd.get(p.end);
    if (!prev || p.filed > prev.filed) byEnd.set(p.end, p);
  }
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/** Instants that fall on the fiscal year end (Joby: December 31). */
export function fiscalYearEnds(points: Point[], monthDay = "12-31"): Point[] {
  return points.filter((p) => p.end.endsWith(monthDay));
}

/** Last n items of an array (newest last). */
export const lastN = <T,>(arr: T[], n: number): T[] => arr.slice(Math.max(0, arr.length - n));

/** Sum of the last `n` quarterly values, only if all n quarters are present and contiguous. */
export function trailingSum(quarters: Point[], n = 4): { val: number; from: string; to: string } | null {
  const q = lastN(quarters, n);
  if (q.length < n) return null;
  for (let i = 1; i < q.length; i++) {
    const gap = daysBetween(q[i - 1].end, q[i].end);
    if (gap < 80 || gap > 100) return null;
  }
  return { val: q.reduce((s, p) => s + p.val, 0), from: q[0].start ?? q[0].end, to: q[q.length - 1].end };
}
