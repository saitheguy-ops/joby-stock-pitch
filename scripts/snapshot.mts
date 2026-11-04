/**
 * npm run snapshot
 *
 * Fetches the latest Joby data with the app's own data layer (src/lib) and writes
 * data/snapshot.json: the only facts a briefing may cite. The previous snapshot is
 * kept as data/snapshot.previous.json so a refresh can see what changed.
 *
 * Runs as plain Node via tsx. JOBY_SCRIPT=1 turns Next's cacheLife() into a no-op.
 */
process.env.JOBY_SCRIPT = "1";

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getUpcomingCatalysts } from "../src/lib/catalysts";
import { JOBY_CIK, PEER_CANDIDATES, TICKER } from "../src/lib/config";
import { EIGHT_K_ITEMS, getFilings } from "../src/lib/edgar";
import { getFinancials } from "../src/lib/edgar";
import { getLatestPeriodicHighlights } from "../src/lib/filings";
import { computeKeyMetrics } from "../src/lib/joby";
import { runDefaultModel } from "../src/lib/model";
import { getNews } from "../src/lib/news";
import { ASSUMPTIONS_AS_OF } from "../src/lib/scenarios";
import { computeReaction, extractDates, isUpcoming, windowReturns, type Bar } from "../src/lib/snapshot/market";
import type { PerfRow, Snapshot, SnapshotEvent, SnapshotFiling, SnapshotNews, Src } from "../src/lib/snapshot/types";
import { NEWS_WINDOW_DAYS, validateSnapshot } from "../src/lib/snapshot/validate";
import { safe, yahooQuoteUrl } from "../src/lib/sources";
import { getHistory, getProfile, getQuote } from "../src/lib/yahoo";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data", "snapshot.json");
const PREV = path.join(ROOT, "data", "snapshot.previous.json");
const BENCHMARK = "SPY";

const now = new Date();
const nowIso = now.toISOString();
const status: Snapshot["sourcesStatus"] = [];
const track = <T,>(name: string, r: { ok: true; data: T } | { ok: false; error: string }): T | null => {
  status.push(r.ok ? { name, ok: true } : { name, ok: false, error: r.error });
  if (!r.ok) console.warn(`  ⚠ ${name}: ${r.error}`);
  return r.ok ? r.data : null;
};
const historyUrl = (t: string) => `${yahooQuoteUrl(t)}history/`;

async function main() {
  console.log(`Snapshot for ${TICKER} at ${nowIso}`);

  // ---- Fetch everything in parallel; each source fails independently. ----
  const peers = PEER_CANDIDATES.map((p) => p.ticker);
  const tickers = [TICKER, BENCHMARK, ...peers];
  const [quoteR, finR, hlR, modelR, profR, newsR, filingsR, ...histR] = await Promise.all([
    safe(() => getQuote(TICKER)),
    safe(() => getFinancials()),
    safe(() => getLatestPeriodicHighlights()),
    runDefaultModel(),
    safe(() => getProfile(TICKER)),
    safe(() => getNews()),
    safe(() => getFilings()),
    ...tickers.map((t) => safe(() => getHistory(t, "1Y"))),
  ]);
  const quote = track("Yahoo quote", quoteR);
  const fin = track("SEC EDGAR companyfacts", finR);
  const hl = track("SEC latest 10-Q/10-K text", hlR);
  const model = track("Valuation model (EDGAR + Yahoo)", modelR);
  const prof = track("Yahoo profile/calendar/analysts", profR);
  const news = track("News (Yahoo + Google News)", newsR);
  const filings = track("SEC EDGAR submissions", filingsR);
  if (news) for (const f of news.feeds) status.push(f.ok ? { name: `News feed: ${f.name}`, ok: true } : { name: `News feed: ${f.name}`, ok: false, error: f.error });
  const histories = new Map<string, Bar[]>();
  tickers.forEach((t, i) => {
    const h = track(`Yahoo 1Y daily history ${t}`, histR[i]);
    if (h) histories.set(t, h.points.map((p) => ({ date: p.date, close: p.close })));
  });

  // ---- Price & performance ----
  const price: Snapshot["price"] = quote?.price
    ? {
        value: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        marketCap: quote.marketCap,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        marketState: quote.marketState,
        source: { label: `Yahoo Finance quote (${quote.exchange ?? "NYSE"})`, url: yahooQuoteUrl(TICKER), asOf: quote.marketTime ?? quote.fetchedAt },
      }
    : null;
  const names: Record<string, string> = { [TICKER]: "Joby Aviation", [BENCHMARK]: "S&P 500 ETF (SPY)" };
  const performance: PerfRow[] = tickers.flatMap((t): PerfRow[] => {
    const bars = histories.get(t);
    if (!bars?.length) return [];
    const last = bars[bars.length - 1];
    return [
      {
        ticker: t,
        name: names[t] ?? PEER_CANDIDATES.find((p) => p.ticker === t)?.note.split(";")[0] ?? t,
        role: t === TICKER ? "subject" : t === BENCHMARK ? "benchmark" : "peer",
        lastClose: last.close,
        lastDate: last.date,
        returns: windowReturns(bars),
        source: { label: `Yahoo Finance daily adjusted closes, ${t}`, url: historyUrl(t), asOf: last.date },
      },
    ];
  });

  // ---- Key metrics ----
  const m = fin ? computeKeyMetrics(fin) : null;
  const hlSrc: Src | null = hl ? { label: `SEC ${hl.filing.form} for period ending ${hl.filing.reportDate} (filed ${hl.filing.filed})`, url: hl.filing.url, asOf: hl.filing.filed } : null;
  const shareHist = fin?.coverShares.map((p) => ({
    date: p.end,
    shares: p.val,
    source: { label: `SEC ${p.form} cover page (filed ${p.filed})`, url: `https://www.sec.gov/Archives/edgar/data/${Number(JOBY_CIK)}/${p.accn.replace(/-/g, "")}/${p.accn}-index.htm`, asOf: p.end },
  })) ?? [];
  const lastShares = shareHist[shareHist.length - 1];
  const yearAgo = new Date(Date.parse(lastShares?.date ?? nowIso) - 365 * 86_400_000).toISOString().slice(0, 10);
  const sharesYearAgo = [...shareHist].reverse().find((h) => h.date <= yearAgo);
  const metrics: Snapshot["metrics"] = {
    balanceSheetDate: m?.balanceSheetDate ?? null,
    cashAndInvestments: m?.cashAndInvestments ?? null,
    debt: m?.debt ?? null,
    quarterlyBurn: m?.quarterlyBurn ?? null,
    avgQuarterlyBurnTTM: m?.avgQuarterlyBurnTTM ?? null,
    annualBurnTTM: m?.annualBurnTTM ?? null,
    runway: {
      quartersAtLatestBurn: m?.runwayQuartersLatest ?? null,
      quartersAtAvgBurn: m?.runwayQuartersAvg ?? null,
      endDateAtLatestBurn: m?.runwayEndLatest ?? null,
      proFormaQuarters: m?.proFormaRunwayQuarters ?? null,
      proFormaCash: m?.proFormaCash ?? null,
      adjustments: (m?.adjustments ?? []).map((a) => ({ label: a.label, cashImpact: a.cashImpact, explanation: a.explanation, source: a.source })),
      source: m?.quarterlyBurn?.source ?? null,
    },
    shares: {
      latest: m?.sharesOutstanding ?? null,
      history: shareHist,
      dilutionSinceFirst: m?.dilution?.totalPct ?? null,
      dilutionPerYear: m?.dilution?.annualPct ?? null,
      dilutionLast12m: lastShares && sharesYearAgo ? lastShares.shares / sharesYearAgo.shares - 1 : null,
    },
    certification: hl && hlSrc ? { statements: hl.certification, source: hlSrc } : null,
    filingMilestones: hl && hlSrc ? { statements: hl.milestones, source: hlSrc } : null,
    legal: hl && hlSrc ? { statements: hl.legal, source: hlSrc } : null,
  };

  // ---- Valuation under current assumptions ----
  const valuation: Snapshot["valuation"] = model
    ? {
        assumptionsFile: "content/assumptions.json",
        assumptionsAsOf: ASSUMPTIONS_AS_OF,
        company: { ...model.data.company },
        inputSources: { ...model.data.sources },
        scenarios: model.scenarios.map((s) => {
          const { id, name, probability, ...inputs } = s;
          return { id, name, probability, inputs, pricePerShare: model.prices[s.id] };
        }),
        weighted: model.weighted,
        recommendation: model.recommendation,
        rule: "Probability-weighted upside > +15% = BUY, < −15% = SELL, otherwise HOLD",
        impliedFleetAtScale: model.impliedFleet,
        topDrivers: model.topDrivers,
      }
    : null;

  const analysts: Snapshot["analysts"] =
    prof && prof.analystTargetMean !== null
      ? {
          mean: prof.analystTargetMean,
          low: prof.analystTargetLow,
          high: prof.analystTargetHigh,
          count: prof.analystCount,
          source: { label: "Yahoo Finance analyst price targets", url: `${yahooQuoteUrl(TICKER)}analysis/`, asOf: prof.fetchedAt },
        }
      : null;

  // ---- News & filings with stock reactions ----
  const jobyBars = histories.get(TICKER) ?? [];
  const spyBars = histories.get(BENCHMARK) ?? [];
  const reactionSrc = (session: string): Src => ({ label: "Yahoo Finance daily adjusted closes, JOBY and SPY", url: historyUrl(TICKER), asOf: session });
  const reactionFor = (iso: string) => {
    const r = computeReaction(iso, jobyBars, spyBars, nowIso, reactionSrc(iso.slice(0, 10)));
    if (r) r.source.asOf = r.nextDaySession ?? r.sameDaySession ?? r.eventDateET;
    return r;
  };
  const cutoff = now.getTime() - NEWS_WINDOW_DAYS * 86_400_000;
  const newsItems: SnapshotNews[] = (news?.items ?? [])
    .filter((n) => n.jobySpecific && Date.parse(n.publishedAt) >= cutoff)
    .map((n) => ({
      title: n.title,
      url: n.url,
      publisher: n.publisher,
      publishedAt: n.publishedAt,
      feed: n.feed,
      tag: n.tag,
      matched: n.matched,
      jobySpecific: n.jobySpecific,
      reaction: reactionFor(n.publishedAt),
      source: { label: `${n.publisher ?? "News"} via ${n.feed}`, url: n.url, asOf: n.publishedAt },
    }));
  const filingItems: SnapshotFiling[] = (filings ?? [])
    .filter((f) => Date.parse(f.filed) >= cutoff && /^(8-K|8-K\/A|10-Q|10-K|424B\d|S-3|S-3ASR|DEF 14A|SC 13D|SC 13G)/.test(f.form))
    .map((f) => {
      const items = f.items
        .split(",")
        .filter((i) => i && i !== "9.01")
        .map((i) => EIGHT_K_ITEMS[i] ?? `Item ${i}`)
        .join(", ");
      return {
        form: f.form,
        items: f.items,
        itemsDescription: f.form.startsWith("424B") ? "Prospectus supplement (securities offering)" : items,
        filed: f.filed,
        acceptedAt: f.acceptedAt,
        reportDate: f.reportDate,
        url: f.url,
        reaction: reactionFor(f.acceptedAt ?? `${f.filed}T21:00:00Z`),
        source: { label: `SEC ${f.form} filed ${f.filed}`, url: f.url, asOf: f.filed },
      };
    });

  // ---- Upcoming events ----
  const events: SnapshotEvent[] = [];
  const today = nowIso.slice(0, 10);
  for (const d of prof?.earningsDates ?? []) {
    events.push({
      date: d.slice(0, 10),
      precision: "day",
      when: new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET",
      title: `Quarterly earnings release${prof?.earningsIsEstimate ? " (date is Yahoo's estimate)" : ""}${prof?.revenueEstimateAvg ? `; consensus revenue ≈ $${(prof.revenueEstimateAvg / 1e6).toFixed(1)}M` : ""}`,
      kind: "earnings",
      past: Date.parse(d) < now.getTime(),
      source: { label: "Yahoo Finance earnings calendar", url: yahooQuoteUrl(TICKER), asOf: prof!.fetchedAt },
    });
  }
  if (hl && hlSrc) {
    for (const s of hl.milestones) for (const d of extractDates(s, hl.filing.filed)) if (isUpcoming(d, today)) events.push({ ...d, title: s, kind: "filing", past: false, source: hlSrc });
  }
  const catalysts = await getUpcomingCatalysts(news?.items ?? []);
  for (const c of catalysts.items.filter((c) => c.kind === "news")) {
    for (const d of extractDates(c.title, c.source.asOf)) if (isUpcoming(d, today)) events.push({ ...d, title: c.title, kind: "news", past: false, source: { label: c.source.label, url: c.source.url, asOf: c.source.asOf } });
  }
  const seen = new Set<string>();
  const uniqueEvents = events
    .filter((e) => (seen.has(`${e.date}|${e.title}`) ? false : (seen.add(`${e.date}|${e.title}`), true)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const snapshot: Snapshot = {
    schemaVersion: 1,
    generatedAt: nowIso,
    ticker: TICKER,
    sourcesStatus: status,
    price,
    performance,
    metrics,
    valuation,
    analysts,
    news: newsItems,
    filings: filingItems,
    events: uniqueEvents,
  };

  const check = validateSnapshot(snapshot, nowIso);
  if (check.errors.length) {
    console.error("✗ Snapshot failed validation; not writing it:\n  " + check.errors.join("\n  "));
    process.exit(1);
  }
  await mkdir(path.dirname(OUT), { recursive: true });
  const existing = await readFile(OUT, "utf8").catch(() => null);
  if (existing) await copyFile(OUT, PREV);
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n");

  const okCount = status.filter((s) => s.ok).length;
  console.log(`✓ Wrote ${path.relative(ROOT, OUT)}${existing ? ` (previous kept as ${path.relative(ROOT, PREV)})` : ""}`);
  console.log(`  sources ok: ${okCount}/${status.length} · news: ${newsItems.length} · filings: ${filingItems.length} · events: ${uniqueEvents.length} · sourced items: ${check.sourcesChecked}`);
  if (price) console.log(`  price: $${price.value} (${price.source.asOf})`);
  if (valuation) console.log(`  model: ${valuation.recommendation} · weighted target $${valuation.weighted.target.toFixed(2)} (${(valuation.weighted.upside * 100).toFixed(0)}%)`);
  for (const w of check.warnings) console.warn(`  ⚠ ${w}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
