import "server-only";
import { TICKER } from "./config";
import { getLatestPeriodicHighlights } from "./filings";
import type { NewsItem } from "./news";
import { safe, yahooQuoteUrl, type Source } from "./sources";
import { getProfile } from "./yahoo";

export interface Catalyst {
  /** ISO date when known; null for undated milestones. */
  date: string | null;
  when: string;
  title: string;
  kind: "earnings" | "filing" | "news";
  source: Source;
}

/** Headlines that point forward: plans, targets, upcoming events. */
export const FORWARD_RE = /\b(will|plans?|planned|to (launch|begin|start|open|deliver|fly)|expects?|set to|targets?|aims?|upcoming|on track|slated|next (year|month|week)|by (20\d\d|year[- ]end))\b/i;

/** Syndicated market-research press releases mention many companies and dates; skip them. */
const MARKET_REPORT_RE = /market (report|forecast|size|outlook)|forecast (to|and strategies)|\bcagr\b|billion market/i;

export async function getUpcomingCatalysts(news: NewsItem[]): Promise<{ items: Catalyst[]; errors: string[] }> {
  const [prof, hl] = await Promise.all([safe(() => getProfile(TICKER)), safe(() => getLatestPeriodicHighlights())]);
  const items: Catalyst[] = [];
  const errors: string[] = [];
  const now = Date.now();

  if (prof.ok) {
    for (const d of prof.data.earningsDates) {
      const past = Date.parse(d) < now;
      items.push({
        date: d,
        when: new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET",
        title: past
          ? "Most recent earnings release (results may now be out; check the latest 8-K and 10-Q)"
          : `Quarterly earnings release${prof.data.earningsIsEstimate ? " (date is Yahoo's estimate)" : ""}${prof.data.revenueEstimateAvg ? `; consensus revenue ≈ $${(prof.data.revenueEstimateAvg / 1e6).toFixed(1)}M` : ""}`,
        kind: "earnings",
        source: { label: "Yahoo Finance earnings calendar", url: `${yahooQuoteUrl(TICKER)}`, asOf: prof.data.fetchedAt },
      });
    }
  } else errors.push(`Earnings calendar: ${prof.error}`);

  if (hl.ok) {
    const f = hl.data.filing;
    for (const s of hl.data.milestones) {
      items.push({
        date: null,
        when: (s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)?\s?\d{0,2},?\s?(20\d\d)\b/)?.[0] ?? "").trim() || "Stated in filing",
        title: s,
        kind: "filing",
        source: { label: `SEC ${f.form} for period ending ${f.reportDate} (filed ${f.filed})`, url: f.url, asOf: f.filed },
      });
    }
  } else errors.push(`Filing milestones: ${hl.error}`);

  const cutoff = now - 45 * 86_400_000;
  for (const n of news) {
    if (!n.jobySpecific || Date.parse(n.publishedAt) < cutoff || !FORWARD_RE.test(n.title) || MARKET_REPORT_RE.test(n.title)) continue;
    items.push({
      date: null,
      when: `Mentioned ${new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
      title: n.title,
      kind: "news",
      source: { label: `${n.publisher ?? "News"} via ${n.feed}`, url: n.url, asOf: n.publishedAt },
    });
    if (items.filter((i) => i.kind === "news").length >= 6) break;
  }
  return { items, errors };
}
