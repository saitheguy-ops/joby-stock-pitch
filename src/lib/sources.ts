/** Every number shown in the UI carries a Source so it can be linked and dated. */
export interface Source {
  /** Short human label, e.g. "SEC 10-Q (filed 2026-08-06)". */
  label: string;
  url: string;
  /** ISO date (or datetime) the value is as of. */
  asOf: string;
}

export interface Sourced<T> {
  value: T;
  source: Source;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Run a data loader and convert any thrown error into a displayable failure. */
export async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[data]", msg);
    return { ok: false, error: msg.slice(0, 300) };
  }
}

export const yahooQuoteUrl = (ticker: string) =>
  `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;

export const secFilingIndexUrl = (cik: string, accn: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${accn}-index.htm`;

export const secDocUrl = (cik: string, accn: string, doc: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${doc}`;

export const edgarCompanyFactsUrl = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

export const edgarBrowseUrl = (cik: string) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`;
