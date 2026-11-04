import "server-only";
import { cacheLife } from "next/cache";
import { PEER_CANDIDATES, TICKER } from "./config";
import { getFinancials } from "./edgar";
import { trailingSum } from "./edgar-parse";
import { secJson } from "./http";
import { safe, secFilingIndexUrl, yahooQuoteUrl, type Source } from "./sources";
import { getFxToUsd, getPeerFinancials, type PeerFinancials } from "./yahoo";

export interface CompRow {
  ticker: string;
  name: string;
  note: string;
  isSubject: boolean;
  listed: boolean;
  listingNote: string;
  exchange: string | null;
  price: number | null;
  marketCapUsd: number | null;
  cashUsd: number | null;
  debtUsd: number | null;
  /** EV = market cap + debt − cash. */
  evUsd: number | null;
  /** Trailing-twelve-month operating cash burn, positive = burning. */
  burnUsd: number | null;
  burnSource: "Yahoo" | "SEC EDGAR" | null;
  /** Years of cash at the TTM burn rate. */
  cashYears: number | null;
  financialCurrency: string | null;
  fxRate: number | null;
  mostRecentQuarter: string | null;
  sources: Source[];
  error?: string;
}

const MAJOR_EXCHANGES = /NYSE|Nasdaq|NasdaqGS|NasdaqGM|NasdaqCM|NYQ|NMS|NGM|NCM|NYSE American|AMEX/i;

/** SEC ticker -> CIK map, used to fall back to EDGAR when Yahoo lacks cash-flow data. */
async function getCikMap(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("days");
  const raw = await secJson<Record<string, { cik_str: number; ticker: string }>>("https://www.sec.gov/files/company_tickers.json");
  const out: Record<string, string> = {};
  for (const v of Object.values(raw)) out[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
  return out;
}

async function edgarTtmBurn(ticker: string): Promise<{ burn: number; source: Source } | null> {
  const map = await safe(getCikMap);
  const cik = map.ok ? map.data[ticker] : undefined;
  if (!cik) return null;
  const fin = await safe(() => getFinancials(cik));
  if (!fin.ok) return null;
  const cfo = fin.data.cashflow.find((l) => l.key === "cfo");
  const ttm = cfo ? trailingSum(cfo.quarterly, 4) : null;
  if (!ttm || !cfo) return null;
  const last = cfo.quarterly[cfo.quarterly.length - 1];
  return {
    burn: -ttm.val,
    source: { label: `SEC EDGAR ${ticker} operating cash flow, 4 quarters to ${ttm.to}`, url: secFilingIndexUrl(cik, last.accn), asOf: ttm.to },
  };
}

function buildRow(ticker: string, note: string, p: PeerFinancials, fx: number | null, fxAsOf: string | null, edgar: Awaited<ReturnType<typeof edgarTtmBurn>>): CompRow {
  const ageDays = p.marketTime ? (Date.now() - Date.parse(p.marketTime)) / 86_400_000 : Infinity;
  const onExchange = !!p.exchange && MAJOR_EXCHANGES.test(p.exchange);
  const listed = ageDays <= 10 && onExchange;
  const conv = (v: number | null) => (v === null || fx === null ? null : v * fx);
  const cash = conv(p.totalCash);
  const debt = conv(p.totalDebt);
  let burn = p.operatingCashflowTTM !== null && fx !== null ? -p.operatingCashflowTTM * fx : null;
  let burnSource: CompRow["burnSource"] = burn !== null ? "Yahoo" : null;
  const sources: Source[] = [{ label: `Yahoo Finance ${ticker} quote & financial data`, url: yahooQuoteUrl(ticker), asOf: p.marketTime ?? p.fetchedAt }];
  if (burn === null && edgar) {
    burn = edgar.burn;
    burnSource = "SEC EDGAR";
    sources.push(edgar.source);
  }
  if (p.financialCurrency && p.financialCurrency !== "USD" && fx !== null) {
    sources.push({ label: `Yahoo Finance ${p.financialCurrency}/USD rate ${fx.toFixed(4)}`, url: yahooQuoteUrl(`${p.financialCurrency}USD=X`), asOf: fxAsOf ?? p.fetchedAt });
  }
  const mcap = p.marketCap;
  return {
    ticker,
    name: p.name ?? ticker,
    note,
    isSubject: ticker === TICKER,
    listed,
    listingNote: listed
      ? `Quoted on ${p.exchange}; last trade ${p.marketTime?.slice(0, 10)}`
      : `Not verified as listed (exchange: ${p.exchange ?? "unknown"}, last trade: ${p.marketTime?.slice(0, 10) ?? "none"})`,
    exchange: p.exchange,
    price: p.price,
    marketCapUsd: mcap,
    cashUsd: cash,
    debtUsd: debt,
    evUsd: mcap !== null && cash !== null && debt !== null ? mcap + debt - cash : null,
    burnUsd: burn,
    burnSource,
    cashYears: cash !== null && burn !== null && burn > 0 ? cash / burn : null,
    financialCurrency: p.financialCurrency,
    fxRate: fx,
    mostRecentQuarter: p.mostRecentQuarter,
    sources,
  };
}

/** Joby plus listed eVTOL / AAM peers, all values converted to USD. */
export async function getComps(): Promise<{ rows: CompRow[]; fetchedAt: string }> {
  const list = [{ ticker: TICKER, note: "Subject company: piloted eVTOL air taxi" }, ...PEER_CANDIDATES];
  const rows = await Promise.all(
    list.map(async ({ ticker, note }): Promise<CompRow> => {
      const res = await safe(() => getPeerFinancials(ticker));
      if (!res.ok) {
        return {
          ticker, name: ticker, note, isSubject: ticker === TICKER, listed: false, listingNote: "No quote returned by Yahoo", exchange: null, price: null,
          marketCapUsd: null, cashUsd: null, debtUsd: null, evUsd: null, burnUsd: null, burnSource: null, cashYears: null,
          financialCurrency: null, fxRate: null, mostRecentQuarter: null, sources: [{ label: `Yahoo Finance ${ticker}`, url: yahooQuoteUrl(ticker), asOf: new Date().toISOString() }], error: res.error,
        };
      }
      const p = res.data;
      const cur = p.financialCurrency ?? "USD";
      const fx = await safe(() => getFxToUsd(cur));
      const needEdgar = p.operatingCashflowTTM === null;
      const edgar = needEdgar ? await edgarTtmBurn(ticker) : null;
      return buildRow(ticker, note, p, fx.ok ? fx.data.rate : null, fx.ok ? fx.data.asOf : null, edgar);
    }),
  );
  return { rows, fetchedAt: new Date().toISOString() };
}
