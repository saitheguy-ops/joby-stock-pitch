import "server-only";
import { JOBY_CIK, TICKER } from "./config";
import { getFinancials, type Financials, type LineItem } from "./edgar";
import { lastN, trailingSum, type Point } from "./edgar-parse";
import { applicableAdjustments, type CashAdjustment } from "./adjustments";
import { dilutionStats, runwayQuarters, addQuarters, type DilutionStats } from "./metrics";
import { secFilingIndexUrl, yahooQuoteUrl, type Result, type Source, type Sourced, safe } from "./sources";
import { getQuote, type QuoteSnapshot } from "./yahoo";
import type { CompanyInputs } from "./valuation";

export const findItem = (f: Financials, key: string): LineItem | undefined =>
  [...f.income, ...f.balance, ...f.cashflow].find((l) => l.key === key);

export const latestPoint = (l: LineItem | undefined): Point | undefined => l?.quarterly[l.quarterly.length - 1];

export function edgarSource(p: Point, what: string): Source {
  return {
    label: `SEC ${p.form} · ${what} ${p.start ? `${p.start} to ` : "as of "}${p.end}${p.derived ? " (derived from YTD)" : ""} · filed ${p.filed}`,
    url: secFilingIndexUrl(JOBY_CIK, p.accn),
    asOf: p.end,
  };
}

export function yahooSource(q: QuoteSnapshot, what = "Quote"): Source {
  return {
    label: `Yahoo Finance · ${what}${q.marketTime ? ` as of ${q.marketTime.slice(0, 16).replace("T", " ")} UTC` : ""}`,
    url: yahooQuoteUrl(q.ticker),
    asOf: q.marketTime ?? q.fetchedAt,
  };
}

export interface KeyMetrics {
  cashAndInvestments: Sourced<number> | null;
  debt: Sourced<number> | null;
  sharesOutstanding: Sourced<number> | null;
  /** Most recent quarter's free-cash-flow burn (positive = burning). */
  quarterlyBurn: Sourced<number> | null;
  /** Average quarterly burn over the last four quarters. */
  avgQuarterlyBurnTTM: Sourced<number> | null;
  annualBurnTTM: Sourced<number> | null;
  runwayQuartersLatest: number | null;
  runwayQuartersAvg: number | null;
  runwayEndLatest: string | null;
  runwayEndAvg: string | null;
  dilution: DilutionStats | null;
  dilutionSource: Source | null;
  balanceSheetDate: string | null;
  /** Announced cash events not yet in the balance sheet (see lib/adjustments.ts). */
  adjustments: CashAdjustment[];
  proFormaCash: number | null;
  proFormaRunwayQuarters: number | null;
  proFormaRunwayEnd: string | null;
}

export function computeKeyMetrics(f: Financials): KeyMetrics {
  const cashInv = latestPoint(findItem(f, "cashinv"));
  const debt = latestPoint(findItem(f, "ltdebt"));
  const fcf = findItem(f, "fcf");
  const fcfLatest = latestPoint(fcf);
  const ttm = fcf ? trailingSum(fcf.quarterly, 4) : null;
  const cover = f.coverShares[f.coverShares.length - 1];

  const quarterlyBurn = fcfLatest ? -fcfLatest.val : null;
  const avgBurn = ttm ? -ttm.val / 4 : null;
  const liquidity = cashInv?.val ?? null;
  const rLatest = liquidity !== null && quarterlyBurn !== null ? runwayQuarters(liquidity, quarterlyBurn) : null;
  const rAvg = liquidity !== null && avgBurn !== null ? runwayQuarters(liquidity, avgBurn) : null;

  const adjustments = applicableAdjustments(cashInv?.end ?? null);
  const proFormaCash = liquidity !== null ? liquidity + adjustments.reduce((sum, a) => sum + a.cashImpact, 0) : null;
  const rProForma = proFormaCash !== null && quarterlyBurn !== null ? runwayQuarters(proFormaCash, quarterlyBurn) : null;

  const shareSeries = f.coverShares.map((p) => ({ date: p.end, shares: p.val }));
  const lastFcf = fcf ? lastN(fcf.quarterly, 4) : [];

  return {
    cashAndInvestments: cashInv ? { value: cashInv.val, source: edgarSource(cashInv, "balance sheet") } : null,
    debt: debt ? { value: debt.val, source: edgarSource(debt, "balance sheet") } : null,
    sharesOutstanding: cover
      ? {
          value: cover.val,
          source: {
            label: `SEC ${cover.form} cover page · shares outstanding as of ${cover.end} · filed ${cover.filed}`,
            url: secFilingIndexUrl(JOBY_CIK, cover.accn),
            asOf: cover.end,
          },
        }
      : null,
    quarterlyBurn: fcfLatest && quarterlyBurn !== null ? { value: quarterlyBurn, source: edgarSource(fcfLatest, "cash flow") } : null,
    avgQuarterlyBurnTTM:
      ttm && avgBurn !== null && lastFcf.length
        ? {
            value: avgBurn,
            source: {
              label: `SEC 10-Q/10-K cash-flow statements · 4 quarters ${ttm.from} to ${ttm.to} (quarters derived from YTD)`,
              url: secFilingIndexUrl(JOBY_CIK, lastFcf[lastFcf.length - 1].accn),
              asOf: ttm.to,
            },
          }
        : null,
    annualBurnTTM:
      ttm && lastFcf.length
        ? {
            value: -ttm.val,
            source: {
              label: `SEC cash-flow statements · trailing 4 quarters to ${ttm.to}`,
              url: secFilingIndexUrl(JOBY_CIK, lastFcf[lastFcf.length - 1].accn),
              asOf: ttm.to,
            },
          }
        : null,
    runwayQuartersLatest: rLatest,
    runwayQuartersAvg: rAvg,
    runwayEndLatest: rLatest !== null && cashInv ? addQuarters(cashInv.end, rLatest) : null,
    runwayEndAvg: rAvg !== null && cashInv ? addQuarters(cashInv.end, rAvg) : null,
    dilution: dilutionStats(shareSeries),
    dilutionSource: cover
      ? { label: "SEC filings · cover-page shares outstanding (dei:EntityCommonStockSharesOutstanding), all periods", url: `https://data.sec.gov/api/xbrl/companyconcept/CIK${JOBY_CIK}/dei/EntityCommonStockSharesOutstanding.json`, asOf: cover.end }
      : null,
    balanceSheetDate: cashInv?.end ?? null,
    adjustments,
    proFormaCash: adjustments.length ? proFormaCash : null,
    proFormaRunwayQuarters: adjustments.length ? rProForma : null,
    proFormaRunwayEnd: adjustments.length && rProForma !== null && cashInv ? addQuarters(cashInv.end, rProForma) : null,
  };
}

export interface ModelData {
  company: CompanyInputs;
  sources: {
    price: Source;
    cash: Source;
    debt: Source;
    shares: Source;
    burn: Source;
    latestBurn: Source;
  };
  latestQuarterlyBurnM: number;
  annualBurnM: number;
  balanceSheetDate: string;
  quote: QuoteSnapshot;
}

/** Live, sourced company inputs for the valuation model. */
export async function getModelData(): Promise<Result<ModelData>> {
  return safe(async () => {
    const [fin, quote] = await Promise.all([getFinancials(), getQuote(TICKER)]);
    const m = computeKeyMetrics(fin);
    if (!m.cashAndInvestments || !m.sharesOutstanding || !m.quarterlyBurn || !m.annualBurnTTM || !m.balanceSheetDate)
      throw new Error("EDGAR data is missing cash, shares or cash-flow figures needed for the model");
    if (quote.price === null) throw new Error("Yahoo quote has no price");
    const bsDate = m.balanceSheetDate;
    const bsYear = Number(bsDate.slice(0, 4));
    const bsMonth = Number(bsDate.slice(5, 7));
    // Quarters left in the balance-sheet year (e.g. June 30 -> 2 quarters: Q3 and Q4).
    const stubQuarters = Math.max(0, 4 - Math.round(bsMonth / 3));
    return {
      company: {
        firstForecastYear: bsYear + 1,
        cashAndInvestmentsM: m.cashAndInvestments.value / 1e6,
        debtM: (m.debt?.value ?? 0) / 1e6,
        stubBurnM: (stubQuarters * m.quarterlyBurn.value) / 1e6,
        sharesM: m.sharesOutstanding.value / 1e6,
        currentPrice: quote.price,
      },
      sources: {
        price: yahooSource(quote),
        cash: m.cashAndInvestments.source,
        debt: m.debt?.source ?? { label: "No debt reported in EDGAR", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${JOBY_CIK}`, asOf: bsDate },
        shares: m.sharesOutstanding.source,
        burn: m.annualBurnTTM.source,
        latestBurn: m.quarterlyBurn.source,
      },
      latestQuarterlyBurnM: m.quarterlyBurn.value / 1e6,
      annualBurnM: m.annualBurnTTM.value / 1e6,
      balanceSheetDate: bsDate,
      quote,
    };
  });
}
