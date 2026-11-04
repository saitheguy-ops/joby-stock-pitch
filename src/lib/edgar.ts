import { cacheFor } from "./cache";
import { JOBY_CIK } from "./config";
import {
  annualDurations,
  dedupeFacts,
  fiscalYearEnds,
  instants,
  quarterlyDurations,
  type Point,
  type RawFact,
} from "./edgar-parse";
import { secJson } from "./http";
import { edgarCompanyFactsUrl, secDocUrl, secFilingIndexUrl } from "./sources";

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label: string; units: Record<string, RawFact[]> }>>;
}

export interface LineItem {
  key: string;
  label: string;
  /** XBRL concept(s) used, or a formula for computed rows. */
  concept: string;
  kind: "duration" | "instant";
  unit: "USD" | "shares" | "USD/shares";
  annual: Point[];
  quarterly: Point[];
  /** Computed rows (e.g. free cash flow) have no single filing; we show the formula. */
  computed?: boolean;
  emphasis?: boolean;
  note?: string;
}

export interface Financials {
  cik: string;
  entityName: string;
  fetchedAt: string;
  income: LineItem[];
  balance: LineItem[];
  cashflow: LineItem[];
  /** Cover-page share counts (dei:EntityCommonStockSharesOutstanding), dated. */
  coverShares: Point[];
}

interface Def {
  key: string;
  label: string;
  concepts: string[];
  kind: "duration" | "instant";
  unit?: LineItem["unit"];
  emphasis?: boolean;
  note?: string;
  /** Flip sign so cash outflows read as negative, as on the cash-flow statement. */
  negate?: boolean;
}

const INCOME: Def[] = [
  {
    key: "revenue",
    label: "Revenue",
    concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"],
    kind: "duration",
    emphasis: true,
    note: "Pre-certification revenue: flight services (incl. Blade charter, acquired Aug 2025), government contracts and engineering services.",
  },
  { key: "rnd", label: "Research & development", concepts: ["ResearchAndDevelopmentExpense"], kind: "duration" },
  { key: "sga", label: "Selling, general & administrative", concepts: ["SellingGeneralAndAdministrativeExpense"], kind: "duration" },
  { key: "opex", label: "Total operating expenses", concepts: ["OperatingExpenses", "CostsAndExpenses"], kind: "duration" },
  { key: "opinc", label: "Operating income (loss)", concepts: ["OperatingIncomeLoss"], kind: "duration", emphasis: true },
  { key: "interest", label: "Interest & investment income", concepts: ["InvestmentIncomeInterest"], kind: "duration" },
  {
    key: "nonop",
    label: "Total other income (loss)",
    concepts: ["NonoperatingIncomeExpense"],
    kind: "duration",
    note: "Swings with non-cash fair-value changes in warrants and earnout shares.",
  },
  { key: "netinc", label: "Net income (loss)", concepts: ["NetIncomeLoss"], kind: "duration", emphasis: true },
  { key: "eps", label: "EPS, basic", concepts: ["EarningsPerShareBasic"], kind: "duration", unit: "USD/shares" },
  {
    key: "wso",
    label: "Weighted avg. shares (basic)",
    concepts: ["WeightedAverageNumberOfSharesOutstandingBasic"],
    kind: "duration",
    unit: "shares",
  },
];

const BALANCE: Def[] = [
  { key: "cash", label: "Cash & cash equivalents", concepts: ["CashAndCashEquivalentsAtCarryingValue"], kind: "instant" },
  { key: "sti", label: "Short-term investments", concepts: ["ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"], kind: "instant" },
  {
    key: "cashinv",
    label: "Cash, equivalents & short-term investments",
    concepts: ["CashCashEquivalentsAndShortTermInvestments"],
    kind: "instant",
    emphasis: true,
    note: "The liquidity figure used for runway.",
  },
  { key: "ca", label: "Total current assets", concepts: ["AssetsCurrent"], kind: "instant" },
  { key: "ppe", label: "Property & equipment, net", concepts: ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization"], kind: "instant" },
  { key: "goodwill", label: "Goodwill", concepts: ["Goodwill"], kind: "instant" },
  { key: "assets", label: "Total assets", concepts: ["Assets"], kind: "instant", emphasis: true },
  { key: "cl", label: "Total current liabilities", concepts: ["LiabilitiesCurrent"], kind: "instant" },
  {
    key: "ltdebt",
    label: "Long-term debt",
    concepts: ["LongTermDebtNoncurrent", "LongTermDebt", "ConvertibleNotesPayable"],
    kind: "instant",
    note: "Mainly the 0.75% convertible senior notes due 2032 (issued Feb 2026), carried net of issuance costs.",
  },
  { key: "liab", label: "Total liabilities", concepts: ["Liabilities"], kind: "instant" },
  { key: "deficit", label: "Accumulated deficit", concepts: ["RetainedEarningsAccumulatedDeficit"], kind: "instant" },
  { key: "equity", label: "Total stockholders' equity", concepts: ["StockholdersEquity"], kind: "instant", emphasis: true },
  { key: "shares", label: "Common shares outstanding", concepts: ["CommonStockSharesOutstanding"], kind: "instant", unit: "shares" },
];

const CASHFLOW: Def[] = [
  { key: "cfo", label: "Net cash from operating activities", concepts: ["NetCashProvidedByUsedInOperatingActivities"], kind: "duration", emphasis: true },
  { key: "capex", label: "Capital expenditures", concepts: ["PaymentsToAcquirePropertyPlantAndEquipment"], kind: "duration", negate: true },
  { key: "cfi", label: "Net cash from investing activities", concepts: ["NetCashProvidedByUsedInInvestingActivities"], kind: "duration" },
  { key: "cff", label: "Net cash from financing activities", concepts: ["NetCashProvidedByUsedInFinancingActivities"], kind: "duration" },
  { key: "sbc", label: "Stock-based compensation (non-cash)", concepts: ["ShareBasedCompensation"], kind: "duration" },
];

function seriesFor(facts: CompanyFacts, def: Def): { concept: string; points: Point[] } | null {
  const gaap = facts.facts["us-gaap"] ?? {};
  const unit = def.unit ?? "USD";
  // Use the candidate concept with the most recent data (companies sometimes switch tags).
  let best: { concept: string; points: Point[] } | null = null;
  for (const c of def.concepts) {
    const raw = gaap[c]?.units?.[unit];
    if (!raw?.length) continue;
    const points = dedupeFacts(raw).map((p) => (def.negate ? { ...p, val: -p.val } : p));
    if (!points.length) continue;
    if (!best || points[points.length - 1].end > best.points[best.points.length - 1].end) best = { concept: c, points };
  }
  return best;
}

function buildItem(facts: CompanyFacts, def: Def): LineItem | null {
  const s = seriesFor(facts, def);
  if (!s) return null;
  const base = { key: def.key, label: def.label, concept: s.concept, kind: def.kind, unit: def.unit ?? "USD", emphasis: def.emphasis, note: def.note } as const;
  if (def.kind === "instant") {
    const all = instants(s.points);
    return { ...base, annual: fiscalYearEnds(all), quarterly: all };
  }
  return { ...base, annual: annualDurations(s.points), quarterly: quarterlyDurations(s.points) };
}

/** Combine two aligned series point-by-point (same end dates), e.g. FCF = CFO - capex. */
export function combine(a: Point[], b: Point[], fn: (x: number, y: number) => number): Point[] {
  const byEnd = new Map(b.map((p) => [`${p.start ?? ""}|${p.end}`, p]));
  return a
    .map((p): Point | null => {
      const q = byEnd.get(`${p.start ?? ""}|${p.end}`);
      if (!q) return null;
      return { ...p, val: fn(p.val, q.val), derived: p.derived || q.derived, filed: p.filed > q.filed ? p.filed : q.filed };
    })
    .filter((p): p is Point => p !== null);
}

/** Joby's financial statements from SEC EDGAR XBRL (companyfacts). Cached for hours. */
export async function getFinancials(cik: string = JOBY_CIK): Promise<Financials> {
  "use cache";
  cacheFor("hours");
  const facts = await secJson<CompanyFacts>(edgarCompanyFactsUrl(cik));
  const build = (defs: Def[]) => defs.map((d) => buildItem(facts, d)).filter((x): x is LineItem => x !== null);

  const income = build(INCOME);
  const balance = build(BALANCE);
  const cashflow = build(CASHFLOW);

  // Free cash flow = CFO - capex. Capex is stored negated (an outflow), so we add.
  const cfo = cashflow.find((l) => l.key === "cfo");
  const capex = cashflow.find((l) => l.key === "capex");
  if (cfo && capex) {
    cashflow.splice(2, 0, {
      key: "fcf",
      label: "Free cash flow (CFO − capex)",
      concept: "Computed: NetCashProvidedByUsedInOperatingActivities − PaymentsToAcquirePropertyPlantAndEquipment",
      kind: "duration",
      unit: "USD",
      computed: true,
      emphasis: true,
      annual: combine(cfo.annual, capex.annual, (x, y) => x + y),
      quarterly: combine(cfo.quarterly, capex.quarterly, (x, y) => x + y),
      note: "Negative free cash flow is the company's cash burn.",
    });
  }

  const cover = facts.facts["dei"]?.["EntityCommonStockSharesOutstanding"]?.units?.["shares"] ?? [];
  const coverShares = instants(dedupeFacts(cover));

  return {
    cik,
    entityName: facts.entityName,
    fetchedAt: new Date().toISOString(),
    income,
    balance,
    cashflow,
    coverShares,
  };
}

export const factSourceUrl = (cik: string, p: Point) => secFilingIndexUrl(cik, p.accn);

/* ------------------------------------------------------------------ */
/* Filing index (submissions API)                                       */
/* ------------------------------------------------------------------ */

export interface Filing {
  form: string;
  filed: string;
  reportDate: string;
  /** EDGAR acceptance time (UTC). Filings accepted after 5:30pm ET get the next day's filing date. */
  acceptedAt: string | null;
  accn: string;
  primaryDoc: string;
  description: string;
  items: string;
  url: string;
  indexUrl: string;
}

interface Submissions {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime?: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      items: string[];
    };
  };
}

/** Recent filings list from data.sec.gov/submissions. Cached for hours. */
export async function getFilings(cik: string = JOBY_CIK): Promise<Filing[]> {
  "use cache";
  cacheFor("hours");
  const s = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const r = s.filings.recent;
  return r.accessionNumber.slice(0, 250).map((accn, i) => ({
    form: r.form[i],
    filed: r.filingDate[i],
    reportDate: r.reportDate[i],
    acceptedAt: r.acceptanceDateTime?.[i] || null,
    accn,
    primaryDoc: r.primaryDocument[i],
    description: r.primaryDocDescription[i],
    items: r.items[i] ?? "",
    url: secDocUrl(cik, accn, r.primaryDocument[i]),
    indexUrl: secFilingIndexUrl(cik, accn),
  }));
}

/** Human-readable descriptions of common 8-K item numbers. */
export const EIGHT_K_ITEMS: Record<string, string> = {
  "1.01": "Material agreement",
  "2.01": "Acquisition/disposition",
  "2.02": "Results of operations",
  "2.03": "New debt obligation",
  "3.02": "Unregistered equity sale",
  "4.01": "Auditor change",
  "5.02": "Officer/director change",
  "5.03": "Charter/bylaw amendment",
  "5.07": "Shareholder vote",
  "7.01": "Reg FD disclosure",
  "8.01": "Other events",
  "9.01": "Exhibits",
};
