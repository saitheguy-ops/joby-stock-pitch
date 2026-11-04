/**
 * Pure helpers for the snapshot: trading-session reactions, period returns and
 * date extraction. No I/O, so they are unit-tested.
 */
import type { Reaction, Src, Window } from "./types";

export interface Bar {
  /** Session date (YYYY-MM-DD, exchange-local). */
  date: string;
  close: number;
}

const ET = "America/New_York";

/** Calendar date and hour/minute of an instant in US Eastern time. */
export function toEastern(iso: string): { date: string; minutes: number } {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const CLOSE_MINUTES = 16 * 60;

function sessionReturn(bars: Bar[], date: string | null): number | null {
  if (!date) return null;
  const i = bars.findIndex((b) => b.date === date);
  if (i <= 0) return null;
  return bars[i].close / bars[i - 1].close - 1;
}

/**
 * Stock reaction to an event at `eventIso`.
 * - sameDay: close-to-close return on the event's ET date (if it was a session).
 * - nextDay: return on the following session.
 * - firstReaction: sameDay if the event came before the 4pm ET close, otherwise nextDay.
 * `nowIso` marks a session as partial if it is today's and the close has not passed.
 */
export function computeReaction(eventIso: string, bars: Bar[], spyBars: Bar[], nowIso: string, source: Src): Reaction | null {
  if (!bars.length || Number.isNaN(Date.parse(eventIso))) return null;
  const ev = toEastern(eventIso);
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  if (ev.date < sorted[0].date) return null;
  const sameDaySession = sorted.some((b) => b.date === ev.date) ? ev.date : null;
  const next = sorted.find((b) => b.date > ev.date);
  const nextDaySession = next?.date ?? null;
  const afterClose = !sameDaySession || ev.minutes >= CLOSE_MINUTES;
  const sameDay = sessionReturn(sorted, sameDaySession);
  const nextDay = sessionReturn(sorted, nextDaySession);
  const spySorted = [...spyBars].sort((a, b) => a.date.localeCompare(b.date));
  const now = toEastern(nowIso);
  const isPartial = (s: string | null) => s !== null && s === now.date && now.minutes < CLOSE_MINUTES;
  return {
    eventDateET: ev.date,
    afterClose,
    sameDaySession,
    sameDay,
    spySameDay: sessionReturn(spySorted, sameDaySession),
    nextDaySession,
    nextDay,
    spyNextDay: sessionReturn(spySorted, nextDaySession),
    firstReaction: afterClose ? nextDay : sameDay,
    partial: isPartial(sameDaySession) || isPartial(nextDaySession),
    source,
  };
}

/** Trailing returns for standard windows, measured from the last bar. */
export function windowReturns(bars: Bar[]): Record<Window, number | null> {
  const s = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const out: Record<Window, number | null> = { "1W": null, "1M": null, "3M": null, YTD: null, "1Y": null };
  if (s.length < 2) return out;
  const last = s[s.length - 1];
  const back = (sessions: number) => (s.length > sessions ? last.close / s[s.length - 1 - sessions].close - 1 : null);
  out["1W"] = back(5);
  out["1M"] = back(21);
  out["3M"] = back(63);
  // 1Y: last close vs the last bar on or before the same date a year earlier.
  const yearAgo = `${Number(last.date.slice(0, 4)) - 1}${last.date.slice(4)}`;
  const base1y = [...s].reverse().find((b) => b.date <= yearAgo);
  out["1Y"] = base1y ? last.close / base1y.close - 1 : null; // null when history is shorter than a year
  // YTD: vs the last close of the prior calendar year.
  const prevYearEnd = [...s].reverse().find((b) => b.date < `${last.date.slice(0, 4)}-01-01`);
  out.YTD = prevYearEnd ? last.close / prevYearEnd.close - 1 : null;
  return out;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export interface ParsedDate {
  date: string;
  precision: "day" | "month" | "year";
  when: string;
}

/**
 * Dates mentioned in a sentence: "May 14, 2027" (day), "January 2027" (month),
 * "in 2026" (year), "November 4" (day; year taken from `referenceIso`).
 * Year-only matches inside a fuller date are not double-counted.
 */
export function extractDates(text: string, referenceIso: string): ParsedDate[] {
  const out: ParsedDate[] = [];
  const used: [number, number][] = [];
  const overlaps = (a: number, b: number) => used.some(([x, y]) => a < y && b > x);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthRe = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?\\b|\\b(${MONTHS.join("|")})\\s+(20\\d\\d)\\b`, "gi");
  for (const m of text.matchAll(monthRe)) {
    const start = m.index ?? 0;
    if (m[1]) {
      const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
      const day = Number(m[2]);
      if (day < 1 || day > 31) continue;
      const year = m[3] ? Number(m[3]) : Number(referenceIso.slice(0, 4));
      out.push({ date: `${year}-${pad(month)}-${pad(day)}`, precision: "day", when: m[0].trim() });
    } else {
      const month = MONTHS.indexOf(m[4].toLowerCase()) + 1;
      out.push({ date: `${m[5]}-${pad(month)}-01`, precision: "month", when: m[0].trim() });
    }
    used.push([start, start + m[0].length]);
  }
  for (const m of text.matchAll(/\b(?:in|by|during|for|of|before|after|through|until)\s+(?:the\s+)?(?:(?:first|second|third|fourth|end of)\s+(?:half|quarter)\s+of\s+)?(20\d\d)\b/gi)) {
    const yStart = (m.index ?? 0) + m[0].length - 4;
    if (overlaps(yStart, yStart + 4)) continue;
    out.push({ date: `${m[1]}-01-01`, precision: "year", when: m[0].replace(/^\w+\s+/, "").trim() });
  }
  return out;
}

/** True if a parsed date is today or later (month/year precision compares the period). */
export function isUpcoming(d: ParsedDate, todayIso: string): boolean {
  const today = todayIso.slice(0, 10);
  if (d.precision === "day") return d.date >= today;
  if (d.precision === "month") return d.date.slice(0, 7) >= today.slice(0, 7);
  return d.date.slice(0, 4) >= today.slice(0, 4);
}
