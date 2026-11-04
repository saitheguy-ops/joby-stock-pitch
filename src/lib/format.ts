/** Display formatting helpers. Inputs in raw units (dollars, shares) unless noted. */

export function fmtMoney(x: number | null | undefined, opts: { digits?: number } = {}): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const abs = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  const d = opts.digits;
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(d ?? 2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(d ?? 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(d ?? 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(d ?? 1)}K`;
  return `${sign}$${abs.toFixed(d ?? 2)}`;
}

/** Format a value already expressed in $ millions. */
export const fmtMoneyM = (m: number | null | undefined, digits?: number) =>
  m === null || m === undefined ? "n/a" : fmtMoney(m * 1e6, { digits });

export function fmtPrice(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  return `$${x.toFixed(2)}`;
}

export function fmtShares(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(3)}B`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  return x.toLocaleString("en-US");
}

export function fmtPct(x: number | null | undefined, digits = 1, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const v = (x * 100).toFixed(digits);
  return `${signed && x > 0 ? "+" : ""}${v.replace("-", "−")}%`;
}

/** Table cell for statements: $ in millions with parentheses for negatives. */
export function fmtStatement(x: number | null | undefined, unit: "USD" | "shares" | "USD/shares"): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  if (unit === "USD/shares") return x < 0 ? `(${Math.abs(x).toFixed(2)})` : x.toFixed(2);
  const m = x / 1e6;
  const s = Math.abs(m).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return x < 0 ? `(${s})` : s;
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "n/a";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" } : { timeZone: "UTC" }),
  });
}

/** "Q2 2026" / "FY 2025" style label for a period end date. */
export function periodLabel(end: string, annual: boolean): string {
  const y = end.slice(0, 4);
  if (annual) return `FY${y}`;
  const m = Number(end.slice(5, 7));
  return `Q${Math.ceil(m / 3)} ${y}`;
}

/** Epoch milliseconds `days` ago (request-time helper; pages calling it render dynamically). */
export function msAgo(days: number): number {
  return Date.now() - days * 86_400_000;
}
