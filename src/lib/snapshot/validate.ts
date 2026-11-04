import type { Snapshot } from "./types";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  /** Number of `source` objects checked. */
  sourcesChecked: number;
}

export const STALE_DAYS = 14;
export const NEWS_WINDOW_DAYS = 60;

const isIsoDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Validate a parsed snapshot. Errors make `npm run snapshot:check` fail; warnings
 * (e.g. staleness, a source that was down) are printed but allowed.
 */
export function validateSnapshot(raw: unknown, nowIso: string = new Date().toISOString()): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sourcesChecked = 0;
  if (!raw || typeof raw !== "object") return { errors: ["Snapshot is not a JSON object"], warnings, sourcesChecked };
  const s = raw as Partial<Snapshot>;

  if (s.schemaVersion !== 1) errors.push(`schemaVersion must be 1 (got ${String(s.schemaVersion)})`);
  if (!isIsoDate(s.generatedAt)) errors.push("generatedAt must be an ISO datetime");
  else {
    const ageDays = (Date.parse(nowIso) - Date.parse(s.generatedAt!)) / 86_400_000;
    if (ageDays < -0.01) errors.push("generatedAt is in the future");
    if (ageDays > STALE_DAYS) warnings.push(`Snapshot is ${ageDays.toFixed(0)} days old (> ${STALE_DAYS}); run npm run snapshot`);
  }
  for (const key of ["sourcesStatus", "performance", "metrics", "news", "filings", "events"] as const) {
    if (s[key] === undefined) errors.push(`Missing section: ${key}`);
  }
  for (const st of s.sourcesStatus ?? []) if (!st.ok) warnings.push(`Source was unavailable: ${st.name} (${st.error ?? "unknown error"})`);
  if (!s.price) warnings.push("No price in snapshot");
  if (!s.valuation) warnings.push("No valuation outputs in snapshot");

  // Every object that carries a `source` must have a usable URL and as-of date.
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== "object") {
      if (typeof node === "number" && !Number.isFinite(node)) errors.push(`${path}: non-finite number`);
      return;
    }
    const obj = node as Record<string, unknown>;
    if ("source" in obj && obj.source !== null) {
      sourcesChecked++;
      const src = obj.source as Record<string, unknown>;
      if (typeof src?.url !== "string" || !/^https?:\/\//.test(src.url)) errors.push(`${path}.source.url missing or not http(s)`);
      if (!isIsoDate(src?.asOf)) errors.push(`${path}.source.asOf missing or not a date`);
      if (typeof src?.label !== "string" || !src.label) errors.push(`${path}.source.label missing`);
    }
    for (const [k, v] of Object.entries(obj)) if (k !== "source") walk(v, `${path}.${k}`);
  };
  walk(s, "snapshot");

  // Items that must each be sourced.
  const requireSource = (list: unknown[] | undefined, name: string) =>
    (list ?? []).forEach((x, i) => {
      if (!x || typeof x !== "object" || !("source" in x) || !(x as { source: unknown }).source) errors.push(`${name}[${i}] has no source`);
    });
  requireSource(s.news, "news");
  requireSource(s.filings, "filings");
  requireSource(s.events, "events");
  requireSource(s.performance, "performance");

  if (isIsoDate(s.generatedAt)) {
    const cutoff = Date.parse(s.generatedAt!) - (NEWS_WINDOW_DAYS + 1) * 86_400_000;
    (s.news ?? []).forEach((n, i) => {
      if (!isIsoDate(n.publishedAt)) errors.push(`news[${i}].publishedAt is not a date`);
      else if (Date.parse(n.publishedAt) < cutoff) errors.push(`news[${i}] is older than ${NEWS_WINDOW_DAYS} days`);
    });
  }
  (s.events ?? []).forEach((e, i) => {
    if (!isIsoDate(e.date)) errors.push(`events[${i}].date is not a date`);
  });
  if (sourcesChecked === 0) errors.push("No sourced items found");
  return { errors, warnings, sourcesChecked };
}
