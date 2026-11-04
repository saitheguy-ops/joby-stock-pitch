/**
 * Shape of data/snapshot.json, written by `npm run snapshot` and validated by
 * `npm run snapshot:check`. The briefing (content/briefing.md) may only cite
 * facts and URLs that appear in this file.
 */

export interface Src {
  label: string;
  url: string;
  /** ISO date or datetime the value is as of. */
  asOf: string;
}

export interface SourcedNumber {
  value: number;
  source: Src;
}

/** Close-to-close stock reaction around an event (returns as fractions, 0.05 = +5%). */
export interface Reaction {
  /** Calendar date of the event in US Eastern time. */
  eventDateET: string;
  /** True if the event landed after the 4pm ET close or on a non-trading day. */
  afterClose: boolean;
  /** Session on the event date (null if it was not a trading day). */
  sameDaySession: string | null;
  sameDay: number | null;
  spySameDay: number | null;
  /** The next trading session after the event date. */
  nextDaySession: string | null;
  nextDay: number | null;
  spyNextDay: number | null;
  /** Session where the market could first react: same day if before the close, else next day. */
  firstReaction: number | null;
  /** A session in the calculation was still trading when the snapshot ran. */
  partial: boolean;
  source: Src;
}

export type Window = "1W" | "1M" | "3M" | "YTD" | "1Y";
export const WINDOWS: Window[] = ["1W", "1M", "3M", "YTD", "1Y"];

export interface PerfRow {
  ticker: string;
  name: string;
  role: "subject" | "benchmark" | "peer";
  lastClose: number | null;
  lastDate: string | null;
  returns: Record<Window, number | null>;
  source: Src;
}

export interface SnapshotNews {
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string;
  feed: string;
  tag: string;
  matched: string[];
  jobySpecific: boolean;
  reaction: Reaction | null;
  source: Src;
}

export interface SnapshotFiling {
  form: string;
  items: string;
  itemsDescription: string;
  filed: string;
  acceptedAt: string | null;
  reportDate: string;
  url: string;
  reaction: Reaction | null;
  source: Src;
}

export interface SnapshotEvent {
  /** ISO date (YYYY-MM-DD); for month/year precision, the first day of that period. */
  date: string;
  precision: "day" | "month" | "year";
  /** Human text for the date, e.g. "May 14, 2027" or "2026". */
  when: string;
  title: string;
  kind: "earnings" | "filing" | "news";
  /** Earnings dates can be in the past if Yahoo has not rolled forward yet. */
  past: boolean;
  source: Src;
}

export interface SnapshotScenario {
  id: string;
  name: string;
  probability: number;
  inputs: Record<string, number | string>;
  pricePerShare: number;
}

export interface Snapshot {
  schemaVersion: 1;
  generatedAt: string;
  ticker: string;
  sourcesStatus: { name: string; ok: boolean; error?: string }[];
  price: {
    value: number;
    change: number | null;
    changePct: number | null;
    marketCap: number | null;
    fiftyTwoWeekLow: number | null;
    fiftyTwoWeekHigh: number | null;
    marketState: string | null;
    source: Src;
  } | null;
  performance: PerfRow[];
  metrics: {
    balanceSheetDate: string | null;
    cashAndInvestments: SourcedNumber | null;
    debt: SourcedNumber | null;
    quarterlyBurn: SourcedNumber | null;
    avgQuarterlyBurnTTM: SourcedNumber | null;
    annualBurnTTM: SourcedNumber | null;
    runway: {
      quartersAtLatestBurn: number | null;
      quartersAtAvgBurn: number | null;
      endDateAtLatestBurn: string | null;
      proFormaQuarters: number | null;
      proFormaCash: number | null;
      adjustments: { label: string; cashImpact: number; explanation: string; source: Src }[];
      source: Src | null;
    };
    shares: {
      latest: SourcedNumber | null;
      history: { date: string; shares: number; source: Src }[];
      dilutionSinceFirst: number | null;
      dilutionPerYear: number | null;
      dilutionLast12m: number | null;
    };
    certification: { statements: string[]; source: Src } | null;
    filingMilestones: { statements: string[]; source: Src } | null;
    legal: { statements: string[]; source: Src } | null;
  };
  valuation: {
    assumptionsFile: string;
    assumptionsAsOf: string;
    company: Record<string, number>;
    inputSources: Record<string, Src>;
    scenarios: SnapshotScenario[];
    weighted: { target: number; low: number; high: number; upside: number };
    recommendation: string;
    rule: string;
    impliedFleetAtScale: number | null;
    topDrivers: { label: string; swing: number }[];
  } | null;
  analysts: { mean: number | null; low: number | null; high: number | null; count: number | null; source: Src } | null;
  news: SnapshotNews[];
  filings: SnapshotFiling[];
  events: SnapshotEvent[];
}
