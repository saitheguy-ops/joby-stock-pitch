import "server-only";
import { cacheFor } from "./cache";
import { JOBY_CIK } from "./config";
import { getFilings, type Filing } from "./edgar";
import { extractMilestoneSentences, extractRiskSummary, htmlToText, sentencesMatching, type RiskGroup } from "./filing-text";
import { secText } from "./http";

export interface FilingRef {
  form: string;
  filed: string;
  reportDate: string;
  url: string;
  indexUrl: string;
}

const ref = (f: Filing): FilingRef => ({ form: f.form, filed: f.filed, reportDate: f.reportDate, url: f.url, indexUrl: f.indexUrl });

export interface RiskFactorsResult {
  filing: FilingRef;
  groups: RiskGroup[];
}

/** "Risk Factors Summary" bullets from the most recent 10-K. */
export async function getRiskFactors(cik: string = JOBY_CIK): Promise<RiskFactorsResult> {
  "use cache";
  cacheFor("days");
  const filings = await getFilings(cik);
  const tenK = filings.find((f) => f.form === "10-K");
  if (!tenK) throw new Error("No 10-K found in recent SEC filings");
  const text = htmlToText(await secText(tenK.url));
  const groups = extractRiskSummary(text);
  if (!groups.length) throw new Error("Could not locate the Risk Factors Summary in the 10-K");
  return { filing: ref(tenK), groups };
}

export interface FilingHighlights {
  filing: FilingRef;
  milestones: string[];
  legal: string[];
  liquidity: string[];
  certification: string[];
  business: string[];
}

const ITC_RE = /International Trade Commission|evidentiary hearing|Initial Determination/;

/** Forward-looking milestones, legal proceedings and liquidity statements from the latest 10-Q or 10-K. */
export async function getLatestPeriodicHighlights(cik: string = JOBY_CIK): Promise<FilingHighlights> {
  "use cache";
  cacheFor("hours");
  const filings = await getFilings(cik);
  const latest = filings.find((f) => f.form === "10-Q" || f.form === "10-K");
  if (!latest) throw new Error("No 10-Q/10-K found in recent SEC filings");
  const text = htmlToText(await secText(latest.url));
  // Only the narrative (MD&A onward) for milestones, to skip footnote mechanics.
  const mdaStart = text.search(/Management[’']s Discussion and Analysis of Financial Condition/i);
  const lastMda = text.lastIndexOf("Management’s Discussion and Analysis of Financial Condition");
  const narrative = text.slice(Math.max(mdaStart, lastMda, 0));
  const year = Number(latest.reportDate.slice(0, 4)) || new Date().getFullYear();
  return {
    filing: ref(latest),
    milestones: extractMilestoneSentences(narrative, year, 8),
    legal: sentencesMatching(
      text,
      /\bArcher\b[^.]*\b(complaint|lawsuit|International Trade Commission|counterclaims?)\b|\b(complaint|lawsuit|International Trade Commission)\b[^.]*\bArcher\b|evidentiary hearing|Initial Determination/,
      12,
    )
      .sort((a, b) => Number(ITC_RE.test(b)) - Number(ITC_RE.test(a)))
      .slice(0, 5),
    liquidity: sentencesMatching(narrative, /at least the next twelve months|dilution to stockholders may result|combination of equity and debt financing/i, 3),
    certification: sentencesMatching(narrative, /\b(five stages|stage 4|type certification|eIPP|GCAA|Dubai)\b/, 6),
    business: sentencesMatching(narrative, /\b(designing and testing|routes to market|vertically[- ]integrated|acquired Blade|up to four passengers)\b/, 5),
  };
}

export interface FilingEvent {
  form: string;
  filed: string;
  url: string;
  indexUrl: string;
  items: string;
  description: string;
}

/** Recent material filings (8-K, 10-Q, 10-K, offerings) for the timeline. */
export async function getRecentMaterialFilings(cik: string = JOBY_CIK, limit = 15): Promise<FilingEvent[]> {
  const filings = await getFilings(cik);
  return filings
    .filter((f) => /^(8-K|10-Q|10-K|424B5|S-3|S-3ASR|DEF 14A)$/.test(f.form))
    .slice(0, limit)
    .map((f) => ({ form: f.form, filed: f.filed, url: f.url, indexUrl: f.indexUrl, items: f.items, description: f.description }));
}
