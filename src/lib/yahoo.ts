import "server-only";
import { cacheFor } from "./cache";
import YahooFinance from "yahoo-finance2";
import { assertSourceUp } from "./http";

/**
 * Yahoo Finance via the `yahoo-finance2` package (server-side only, no API key).
 *
 * Resilience: some networks block one of Yahoo's mirror hosts. If a request to
 * query1.finance.yahoo.com (or the cookie page on finance.yahoo.com) fails at the
 * network level, we retry the identical request on Yahoo's equivalent host. The
 * data is the same; this only changes which Yahoo server answers.
 */
const MIRRORS: [RegExp, string][] = [
  [/^https:\/\/query1\.finance\.yahoo\.com/, "https://query2.finance.yahoo.com"],
  [/^https:\/\/finance\.yahoo\.com\/quote\/[^?]*/, "https://fc.yahoo.com/"],
];

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  assertSourceUp("yahoo");
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
  } catch (err) {
    for (const [re, replacement] of MIRRORS) {
      if (re.test(url)) return fetch(url.replace(re, replacement), { ...init, signal: AbortSignal.timeout(15_000) });
    }
    throw err;
  }
}

const yf = new YahooFinance({ fetch: resilientFetch, suppressNotices: ["yahooSurvey"] });
const NO_VALIDATE = { validateResult: false } as const;

/*
 * With validation off the library returns `unknown`, so we describe just the fields
 * we read. Every field is optional and checked before use.
 */
type MaybeDate = Date | string | number | undefined;
interface ChartRes {
  quotes?: { date: MaybeDate; close?: number | null; adjclose?: number | null }[];
}
interface SearchRes {
  news?: { title: string; link: string; publisher?: string; providerPublishTime?: MaybeDate }[];
}
interface SummaryRes {
  assetProfile?: { longBusinessSummary?: string; industry?: string; sector?: string; fullTimeEmployees?: number; website?: string; city?: string; state?: string };
  calendarEvents?: { earnings?: { earningsDate?: MaybeDate[]; earningsCallDate?: MaybeDate[]; isEarningsDateEstimate?: boolean; revenueAverage?: number } };
  financialData?: { targetMeanPrice?: number; targetLowPrice?: number; targetHighPrice?: number; numberOfAnalystOpinions?: number; financialCurrency?: string; totalCash?: number; totalDebt?: number; operatingCashflow?: number };
  price?: { longName?: string; shortName?: string; exchangeName?: string; currency?: string; regularMarketPrice?: number; marketCap?: number; regularMarketTime?: MaybeDate };
  defaultKeyStatistics?: { mostRecentQuarter?: MaybeDate };
}

const iso = (d: MaybeDate | null): string | null => {
  if (d === undefined || d === null) return null;
  const date = d instanceof Date ? d : new Date(typeof d === "number" && d < 1e12 ? d * 1000 : d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/* ------------------------------------------------------------------ */

export interface QuoteSnapshot {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  marketTime: string | null;
  marketState: string | null;
  fetchedAt: string;
}

export async function getQuote(ticker: string): Promise<QuoteSnapshot> {
  "use cache";
  cacheFor("hours");
  const q = await yf.quote(ticker, undefined, NO_VALIDATE);
  if (!q || typeof q !== "object" || !("symbol" in q)) throw new Error(`No Yahoo quote for ${ticker}`);
  return {
    ticker,
    name: (q.longName ?? q.shortName ?? null) as string | null,
    exchange: (q.fullExchangeName ?? q.exchange ?? null) as string | null,
    currency: (q.currency ?? null) as string | null,
    price: num(q.regularMarketPrice),
    change: num(q.regularMarketChange),
    changePct: num(q.regularMarketChangePercent),
    marketCap: num(q.marketCap),
    sharesOutstanding: num(q.sharesOutstanding),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    marketTime: iso(q.regularMarketTime as Date | undefined),
    marketState: (q.marketState ?? null) as string | null,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */

export type RangeKey = "1M" | "1Y" | "5Y" | "MAX";
export interface PricePoint {
  date: string;
  close: number;
}
export interface PriceHistory {
  range: RangeKey;
  interval: string;
  points: PricePoint[];
  fetchedAt: string;
}

const RANGE_CONFIG: Record<RangeKey, { days: number | null; interval: "1d" | "1wk" }> = {
  "1M": { days: 31, interval: "1d" },
  "1Y": { days: 366, interval: "1d" },
  "5Y": { days: 365 * 5 + 2, interval: "1wk" },
  MAX: { days: null, interval: "1wk" },
};

export async function getHistory(ticker: string, range: RangeKey): Promise<PriceHistory> {
  "use cache";
  cacheFor("hours");
  const cfg = RANGE_CONFIG[range];
  const period1 = cfg.days === null ? new Date("2000-01-01") : new Date(Date.now() - cfg.days * 86_400_000);
  const res = (await yf.chart(ticker, { period1, interval: cfg.interval }, NO_VALIDATE)) as ChartRes;
  const points = (res.quotes ?? [])
    .filter((q) => num(q.close) !== null || num(q.adjclose) !== null)
    .map((q) => ({ date: iso(q.date)!.slice(0, 10), close: (num(q.adjclose) ?? num(q.close))! }));
  if (!points.length) throw new Error(`Yahoo returned no ${range} price history`);
  return { range, interval: cfg.interval, points, fetchedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */

export interface CompanyProfile {
  summary: string | null;
  industry: string | null;
  sector: string | null;
  employees: number | null;
  website: string | null;
  city: string | null;
  state: string | null;
  earningsDates: string[];
  earningsCallDates: string[];
  earningsIsEstimate: boolean | null;
  revenueEstimateAvg: number | null;
  analystTargetMean: number | null;
  analystTargetLow: number | null;
  analystTargetHigh: number | null;
  analystCount: number | null;
  fetchedAt: string;
}

export async function getProfile(ticker: string): Promise<CompanyProfile> {
  "use cache";
  cacheFor("hours");
  const s = (await yf.quoteSummary(
    ticker,
    { modules: ["assetProfile", "calendarEvents", "financialData"] },
    NO_VALIDATE,
  )) as SummaryRes;
  const ap = s.assetProfile;
  const ce = s.calendarEvents?.earnings;
  const fd = s.financialData;
  return {
    summary: ap?.longBusinessSummary ?? null,
    industry: ap?.industry ?? null,
    sector: ap?.sector ?? null,
    employees: num(ap?.fullTimeEmployees),
    website: ap?.website ?? null,
    city: ap?.city ?? null,
    state: ap?.state ?? null,
    earningsDates: (ce?.earningsDate ?? []).map((d) => iso(d)).filter((d): d is string => !!d),
    earningsCallDates: (ce?.earningsCallDate ?? []).map((d) => iso(d)).filter((d): d is string => !!d),
    earningsIsEstimate: ce?.isEarningsDateEstimate ?? null,
    revenueEstimateAvg: num(ce?.revenueAverage),
    analystTargetMean: num(fd?.targetMeanPrice),
    analystTargetLow: num(fd?.targetLowPrice),
    analystTargetHigh: num(fd?.targetHighPrice),
    analystCount: num(fd?.numberOfAnalystOpinions),
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */

export interface YahooNewsItem {
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string;
}

export async function getYahooNews(query: string, count = 25): Promise<YahooNewsItem[]> {
  "use cache";
  cacheFor("hours");
  const res = (await yf.search(query, { newsCount: count, quotesCount: 0 }, NO_VALIDATE)) as SearchRes;
  return (res.news ?? [])
    .map((n) => ({
      title: n.title,
      url: n.link,
      publisher: n.publisher ?? null,
      publishedAt: iso(n.providerPublishTime) ?? "",
    }))
    .filter((n) => n.title && n.url && n.publishedAt);
}

/* ------------------------------------------------------------------ */

export interface PeerFinancials {
  ticker: string;
  name: string | null;
  exchange: string | null;
  quoteCurrency: string | null;
  price: number | null;
  marketCap: number | null;
  marketTime: string | null;
  /** Currency of the statement figures below (may differ from the quote currency). */
  financialCurrency: string | null;
  totalCash: number | null;
  totalDebt: number | null;
  /** Trailing-twelve-month operating cash flow. */
  operatingCashflowTTM: number | null;
  mostRecentQuarter: string | null;
  fetchedAt: string;
}

export async function getPeerFinancials(ticker: string): Promise<PeerFinancials> {
  "use cache";
  cacheFor("hours");
  const s = (await yf.quoteSummary(
    ticker,
    { modules: ["price", "financialData", "defaultKeyStatistics"] },
    NO_VALIDATE,
  )) as SummaryRes;
  const p = s.price;
  const fd = s.financialData;
  if (!p) throw new Error(`No Yahoo price module for ${ticker}`);
  return {
    ticker,
    name: p.longName ?? p.shortName ?? null,
    exchange: p.exchangeName ?? null,
    quoteCurrency: p.currency ?? null,
    price: num(p.regularMarketPrice),
    marketCap: num(p.marketCap),
    marketTime: iso(p.regularMarketTime),
    financialCurrency: fd?.financialCurrency ?? null,
    totalCash: num(fd?.totalCash),
    totalDebt: num(fd?.totalDebt),
    operatingCashflowTTM: num(fd?.operatingCashflow),
    mostRecentQuarter: iso(s.defaultKeyStatistics?.mostRecentQuarter)?.slice(0, 10) ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Units of USD per one unit of `currency` (e.g. GBP -> ~1.3). */
export async function getFxToUsd(currency: string): Promise<{ rate: number; asOf: string | null }> {
  "use cache";
  cacheFor("hours");
  if (currency === "USD") return { rate: 1, asOf: null };
  const q = await yf.quote(`${currency}USD=X`, undefined, NO_VALIDATE);
  const rate = num(q?.regularMarketPrice);
  if (!rate) throw new Error(`No FX rate for ${currency}/USD`);
  return { rate, asOf: iso(q.regularMarketTime as Date | undefined) };
}
