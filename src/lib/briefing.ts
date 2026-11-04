/**
 * Parsing for content/briefing.md (pure, unit-tested).
 *
 * Format (see docs/REFRESH.md):
 *   ---
 *   date: 2026-11-04
 *   data_as_of: 2026-11-04T19:10:41Z
 *   verdict: SELL
 *   price_target: 4.19
 *   price_at_writing: 5.11
 *   previous_verdict: SELL
 *   previous_price_target: 4.19
 *   previous_date: 2026-11-04
 *   ---
 *   ## Verdict and what changed since last time
 *   ## Status scorecard        - **Certification:** improving — reason ([source](url))
 *   ## What changed
 *   ## What it means for the price
 *   ## Upcoming events         - **2027-01-15** — Event — why it matters ([source](url))
 *   ## Things to watch
 */

export const REQUIRED_SECTIONS = [
  "Verdict and what changed since last time",
  "Status scorecard",
  "What changed",
  "What it means for the price",
  "Upcoming events",
  "Things to watch",
] as const;

export const SCORECARD_AREAS = ["Certification", "Cash runway", "Dilution", "Launch timeline", "Partnerships/deals"] as const;
export const RATINGS = ["improving", "stable", "worsening"] as const;
export type Rating = (typeof RATINGS)[number];

export interface FrontMatter {
  date: string;
  data_as_of: string;
  verdict: string;
  price_target: number | null;
  price_at_writing: number | null;
  previous_verdict: string | null;
  previous_price_target: number | null;
  previous_date: string | null;
}

export interface Section {
  heading: string;
  slug: string;
  markdown: string;
}

export interface ScoreItem {
  area: string;
  rating: Rating;
  /** Markdown (keeps the citation link). */
  reason: string;
}

export interface EventItem {
  /** As written, e.g. "2027-01-15", "Jan 2027", "2026". */
  when: string;
  /** Markdown remainder: event — why it matters (source). */
  text: string;
}

export interface Briefing {
  meta: FrontMatter;
  sections: Section[];
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "" || v.trim() === "null") return null;
  const n = Number(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: string | undefined): string | null => (v === undefined || v.trim() === "" || v.trim() === "null" ? null : v.trim());

/** Minimal `key: value` front-matter parser (flat keys only; quotes optional). */
export function parseFrontMatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(m[0].length) };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function splitSections(body: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current) out.push(current);
      current = { heading: h[1], slug: slugify(h[1]), markdown: "" };
    } else if (current) current.markdown += line + "\n";
  }
  if (current) out.push(current);
  return out.map((s) => ({ ...s, markdown: s.markdown.trim() }));
}

export function parseBriefing(text: string): Briefing {
  const { data, body } = parseFrontMatter(text);
  return {
    meta: {
      date: data.date ?? "",
      data_as_of: data.data_as_of ?? "",
      verdict: (data.verdict ?? "").toUpperCase(),
      price_target: num(data.price_target),
      price_at_writing: num(data.price_at_writing),
      previous_verdict: str(data.previous_verdict)?.toUpperCase() ?? null,
      previous_price_target: num(data.previous_price_target),
      previous_date: str(data.previous_date),
    },
    sections: splitSections(body),
  };
}

export const findSection = (b: Briefing, heading: string) => b.sections.find((s) => s.slug === slugify(heading));

/** "- **Certification:** improving — reason" (also accepts "-" or ":" separators). */
export function parseScorecard(markdown: string): ScoreItem[] {
  const out: ScoreItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^[-*]\s+\*\*(.+?):?\*\*:?\s*(improving|stable|worsening)\b\s*[—–:-]?\s*(.*)$/i);
    if (m) out.push({ area: m[1].trim(), rating: m[2].toLowerCase() as Rating, reason: m[3].trim() });
  }
  return out;
}

/** "- **2027-01-15** — Event — why it matters (source)". */
export function parseEvents(markdown: string): EventItem[] {
  const out: EventItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*[—–:-]\s*(.+)$/);
    if (m) out.push({ when: m[1].trim(), text: m[2].trim() });
  }
  return out;
}

/** Whole days between two ISO instants (b − a). */
export function ageInDays(fromIso: string, nowIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(nowIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export interface BriefingIssue {
  level: "error" | "warning";
  message: string;
}

/**
 * Structural checks used by tests and by the refresh workflow:
 * required front-matter and sections, a scorecard covering every area, and a
 * citation link on every bullet. `allowedUrls` (from the snapshot) enforces that
 * the briefing cites nothing outside the snapshot.
 */
export function lintBriefing(text: string, allowedUrls?: Set<string>): BriefingIssue[] {
  const issues: BriefingIssue[] = [];
  const b = parseBriefing(text);
  const { meta } = b;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) issues.push({ level: "error", message: "front-matter `date` must be YYYY-MM-DD" });
  if (Number.isNaN(Date.parse(meta.data_as_of))) issues.push({ level: "error", message: "front-matter `data_as_of` must be an ISO date/time" });
  if (!["BUY", "HOLD", "SELL"].includes(meta.verdict)) issues.push({ level: "error", message: "front-matter `verdict` must be BUY, HOLD or SELL" });
  if (meta.price_target === null) issues.push({ level: "error", message: "front-matter `price_target` must be a number" });
  for (const h of REQUIRED_SECTIONS) if (!findSection(b, h)) issues.push({ level: "error", message: `Missing section: ## ${h}` });
  const score = parseScorecard(findSection(b, "Status scorecard")?.markdown ?? "");
  for (const area of SCORECARD_AREAS) {
    if (!score.some((s) => s.area.toLowerCase() === area.toLowerCase())) issues.push({ level: "error", message: `Scorecard is missing "${area}"` });
  }
  const linkRe = /\]\((https?:\/\/[^)\s]+)\)/g;
  for (const s of b.sections) {
    for (const line of s.markdown.split(/\r?\n/)) {
      if (!/^\s*[-*]\s+/.test(line)) continue;
      const urls = [...line.matchAll(linkRe)].map((m) => m[1]);
      if (!urls.length) issues.push({ level: "error", message: `Uncited bullet in "${s.heading}": ${line.trim().slice(0, 80)}` });
      if (allowedUrls) for (const u of urls) if (!allowedUrls.has(u)) issues.push({ level: "error", message: `URL not in snapshot: ${u}` });
    }
  }
  const words = b.sections.reduce((n, s) => n + s.markdown.split(/\s+/).filter((w) => !/^\(?\[?https?:/.test(w)).length, 0);
  if (words > 900) issues.push({ level: "warning", message: `Briefing is ${words} words; aim for one screen (~600–800)` });
  return issues;
}

/** Every URL that appears anywhere in a snapshot object. */
export function collectUrls(node: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectUrls(n, into));
  else if (node && typeof node === "object") for (const v of Object.values(node)) collectUrls(v, into);
  else if (typeof node === "string" && /^https?:\/\//.test(node)) into.add(node);
  return into;
}
