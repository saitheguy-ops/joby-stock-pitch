/**
 * Pure finance helpers for a pre-revenue company: cash burn, runway and dilution.
 * Kept free of I/O so they can be unit-tested.
 */

/**
 * Free-cash-flow burn for a period, as a positive number when the company is
 * consuming cash. Burn = -(operating cash flow - capital expenditures).
 * EDGAR reports capex (PaymentsToAcquirePropertyPlantAndEquipment) as a positive outflow.
 */
export function freeCashFlowBurn(operatingCashFlow: number, capex: number): number {
  return -(operatingCashFlow - Math.abs(capex));
}

/**
 * Cash runway in quarters = liquidity / quarterly burn.
 * Returns null when the company is not burning cash (burn <= 0), since runway is
 * then unlimited and dividing would be meaningless.
 */
export function runwayQuarters(cashAndInvestments: number, quarterlyBurn: number): number | null {
  if (!Number.isFinite(cashAndInvestments) || !Number.isFinite(quarterlyBurn)) return null;
  if (quarterlyBurn <= 0) return null;
  return Math.max(0, cashAndInvestments) / quarterlyBurn;
}

/** Add a fractional number of quarters to an ISO date (approximate, 91.31 days per quarter). */
export function addQuarters(isoDate: string, quarters: number): string {
  const ms = Date.parse(isoDate) + quarters * 91.3125 * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface SharePoint {
  date: string;
  shares: number;
}

export interface DilutionStats {
  first: SharePoint;
  last: SharePoint;
  /** Total % increase in share count from first to last. */
  totalPct: number;
  /** Compound annual growth rate of the share count. */
  annualPct: number;
  /** Ownership a holder of 1% at `first` would have at `last` without buying more. */
  ownershipRetained: number;
  points: (SharePoint & { pctFromFirst: number })[];
}

export function dilutionStats(series: SharePoint[]): DilutionStats | null {
  const pts = [...series].filter((p) => p.shares > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86_400_000);
  const ratio = last.shares / first.shares;
  return {
    first,
    last,
    totalPct: ratio - 1,
    annualPct: years > 0 ? Math.pow(ratio, 1 / years) - 1 : 0,
    ownershipRetained: first.shares / last.shares,
    points: pts.map((p) => ({ ...p, pctFromFirst: p.shares / first.shares - 1 })),
  };
}
