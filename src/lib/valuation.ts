/**
 * Scenario DCF for a pre-revenue company. Pure functions, no I/O, fully unit-tested.
 * See docs/VALUATION.md for a plain-language walkthrough.
 *
 * Model in one paragraph:
 *  - Before launch the company burns cash at `preLaunchBurnM` per year.
 *  - From the launch year the fleet grows linearly to `fleetAtScale` over `yearsToScale`.
 *  - Revenue = average aircraft in service during the year × revenue per aircraft.
 *  - EBITDA blends from today's burn (-preLaunchBurnM) to the at-scale margin as the
 *    fleet ramps: EBITDA = w·margin·Revenue − (1−w)·burn, w going 0 → 1.
 *  - Free cash flow = EBITDA − tax on positive EBITDA − capex for new aircraft.
 *  - Terminal value at the scale year by exit EV/EBITDA multiple or perpetual growth.
 *  - Equity = PV(FCF) + PV(terminal) + cash & investments − debt − stub-period burn.
 *  - Price = max(0, equity) / (shares × (1 + future dilution)).
 */

export type TerminalMethod = "multiple" | "growth";

export interface ScenarioInputs {
  id: "bear" | "base" | "bull";
  name: string;
  /** Probability weight (0–1). Weights are normalised so they need not sum exactly to 1. */
  probability: number;
  /** First year of commercial passenger revenue at meaningful scale (after type certification). */
  launchYear: number;
  /** Aircraft in commercial service at the end of the launch year. */
  fleetAtLaunch: number;
  /** Aircraft in service at the end of the scale year. */
  fleetAtScale: number;
  /** Years from launch until the fleet reaches scale (terminal year = launchYear + yearsToScale). */
  yearsToScale: number;
  /** Annual revenue per aircraft in service, $ millions. */
  revenuePerAircraftM: number;
  /** EBITDA margin once at scale (0.30 = 30%). */
  ebitdaMarginAtScale: number;
  /** Capital cost of each additional aircraft, $ millions. */
  costPerAircraftM: number;
  /** Annual cash burn before launch, $ millions (positive number). */
  preLaunchBurnM: number;
  /** Cash tax rate applied to positive EBITDA. */
  taxRate: number;
  /** Discount rate (cost of equity for an all-equity, high-risk company). */
  discountRate: number;
  terminalMethod: TerminalMethod;
  /** EV / EBITDA multiple applied in the terminal year. */
  exitMultiple: number;
  /** Perpetual growth rate after the terminal year (growth method). */
  terminalGrowth: number;
  /** Extra shares issued beyond today's count, as a fraction (0.25 = +25%). */
  futureDilution: number;
}

export interface CompanyInputs {
  /** First full forecast year (cash flows discounted from the start of this year). */
  firstForecastYear: number;
  /** Cash, equivalents and short-term investments, $ millions. */
  cashAndInvestmentsM: number;
  /** Debt (principal or carrying value), $ millions. */
  debtM: number;
  /** Burn expected between the balance-sheet date and the first forecast year, $ millions. */
  stubBurnM: number;
  /** Shares outstanding today, millions. */
  sharesM: number;
  /** Current share price, $. */
  currentPrice: number;
}

export interface YearRow {
  year: number;
  fleet: number;
  revenueM: number;
  rampWeight: number;
  ebitdaM: number;
  taxM: number;
  capexM: number;
  fcfM: number;
  discountFactor: number;
  pvFcfM: number;
}

export interface ScenarioResult {
  rows: YearRow[];
  terminalYear: number;
  terminalValueM: number;
  pvTerminalM: number;
  sumPvFcfM: number;
  enterpriseValueM: number;
  equityValueM: number;
  dilutedSharesM: number;
  pricePerShare: number;
  upside: number;
  /** Lowest cumulative cash position (cash + cumulative FCF), shows the funding need. */
  peakFundingNeedM: number;
  /** Terminal value share of EV (how much of the value sits beyond the forecast). */
  terminalShareOfEV: number;
  warnings: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Aircraft in service at the end of `year` (linear ramp from launch to scale). */
export function fleetAt(s: ScenarioInputs, year: number): number {
  if (year < s.launchYear) return 0;
  if (s.yearsToScale <= 0) return s.fleetAtScale;
  const t = clamp((year - s.launchYear) / s.yearsToScale, 0, 1);
  return s.fleetAtLaunch + (s.fleetAtScale - s.fleetAtLaunch) * t;
}

/** Ramp weight w: 0 in the launch year (and before), 1 at scale. */
export function rampWeight(s: ScenarioInputs, year: number): number {
  if (year <= s.launchYear) return 0;
  if (s.yearsToScale <= 0) return 1;
  return clamp((year - s.launchYear) / s.yearsToScale, 0, 1);
}

export function discountFactor(rate: number, periods: number): number {
  return 1 / Math.pow(1 + rate, periods);
}

export function runScenario(s: ScenarioInputs, c: CompanyInputs): ScenarioResult {
  const warnings: string[] = [];
  const terminalYear = Math.max(s.launchYear + Math.max(0, s.yearsToScale), c.firstForecastYear);
  const rows: YearRow[] = [];
  // Debt is assumed outstanding (not repaid) through the forecast, so it does not reduce cash here.
  let cumulativeCash = c.cashAndInvestmentsM - c.stubBurnM;
  let peakFundingNeedM = 0;

  for (let year = c.firstForecastYear; year <= terminalYear; year++) {
    const fleet = fleetAt(s, year);
    const prevFleet = fleetAt(s, year - 1);
    const avgFleet = (fleet + prevFleet) / 2;
    const revenueM = avgFleet * s.revenuePerAircraftM;
    const w = rampWeight(s, year);
    const ebitdaM = w * s.ebitdaMarginAtScale * revenueM - (1 - w) * s.preLaunchBurnM;
    const taxM = Math.max(0, ebitdaM) * s.taxRate;
    const capexM = Math.max(0, fleet - prevFleet) * s.costPerAircraftM;
    const fcfM = ebitdaM - taxM - capexM;
    const periods = year - c.firstForecastYear + 1; // end-of-year discounting
    const df = discountFactor(s.discountRate, periods);
    rows.push({ year, fleet, revenueM, rampWeight: w, ebitdaM, taxM, capexM, fcfM, discountFactor: df, pvFcfM: fcfM * df });
    cumulativeCash += fcfM;
    peakFundingNeedM = Math.min(peakFundingNeedM, cumulativeCash);
  }

  const last = rows[rows.length - 1];
  let terminalValueM = 0;
  if (s.terminalMethod === "multiple") {
    terminalValueM = Math.max(0, last.ebitdaM) * s.exitMultiple;
  } else if (s.discountRate <= s.terminalGrowth) {
    warnings.push("Discount rate must exceed terminal growth; terminal value set to 0.");
  } else {
    // Steady state: taxed EBITDA grows at g; fleet must also grow at g, requiring capex.
    const nextEbitda = Math.max(0, last.ebitdaM) * (1 + s.terminalGrowth);
    const nextFcf = nextEbitda * (1 - s.taxRate) - last.fleet * s.terminalGrowth * s.costPerAircraftM;
    terminalValueM = Math.max(0, nextFcf / (s.discountRate - s.terminalGrowth));
  }
  if (last.ebitdaM <= 0) warnings.push("EBITDA is still negative in the terminal year, so the terminal value is zero.");

  const pvTerminalM = terminalValueM * last.discountFactor;
  const sumPvFcfM = rows.reduce((sum, r) => sum + r.pvFcfM, 0);
  const enterpriseValueM = sumPvFcfM + pvTerminalM;
  const equityValueM = enterpriseValueM + c.cashAndInvestmentsM - c.debtM - c.stubBurnM;
  const dilutedSharesM = c.sharesM * (1 + Math.max(0, s.futureDilution));
  if (equityValueM < 0) warnings.push("Equity value is negative; the price floors at $0 (shareholders' limited liability).");
  const pricePerShare = dilutedSharesM > 0 ? Math.max(0, equityValueM) / dilutedSharesM : 0;

  return {
    rows,
    terminalYear,
    terminalValueM,
    pvTerminalM,
    sumPvFcfM,
    enterpriseValueM,
    equityValueM,
    dilutedSharesM,
    pricePerShare,
    upside: c.currentPrice > 0 ? pricePerShare / c.currentPrice - 1 : 0,
    peakFundingNeedM: Math.min(0, peakFundingNeedM),
    terminalShareOfEV: enterpriseValueM > 0 ? pvTerminalM / enterpriseValueM : 0,
    warnings,
  };
}

export interface WeightedResult {
  weights: { id: ScenarioInputs["id"]; weight: number; price: number }[];
  /** Probability-weighted expected price. */
  target: number;
  low: number;
  high: number;
  upside: number;
}

/** Probability-weighted target: Σ pᵢ·priceᵢ with weights normalised to sum to 1. */
export function probabilityWeighted(
  scenarios: { id: ScenarioInputs["id"]; probability: number; price: number }[],
  currentPrice: number,
): WeightedResult {
  const total = scenarios.reduce((s, x) => s + Math.max(0, x.probability), 0);
  const weights = scenarios.map((x) => ({
    id: x.id,
    weight: total > 0 ? Math.max(0, x.probability) / total : 1 / scenarios.length,
    price: x.price,
  }));
  const target = weights.reduce((s, x) => s + x.weight * x.price, 0);
  const prices = scenarios.map((x) => x.price);
  return {
    weights,
    target,
    low: Math.min(...prices),
    high: Math.max(...prices),
    upside: currentPrice > 0 ? target / currentPrice - 1 : 0,
  };
}

/** Price grid for a scenario across discount rates (rows) × launch years (columns). */
export function sensitivityGrid(
  s: ScenarioInputs,
  c: CompanyInputs,
  rates: number[],
  launchYears: number[],
): number[][] {
  return rates.map((r) =>
    launchYears.map((y) => runScenario({ ...s, discountRate: r, launchYear: y }, c).pricePerShare),
  );
}

export type Recommendation = "BUY" | "HOLD" | "SELL";

/** Simple, disclosed rule: >+15% upside = BUY, < −15% = SELL, otherwise HOLD. */
export function recommend(upside: number, band = 0.15): Recommendation {
  if (upside > band) return "BUY";
  if (upside < -band) return "SELL";
  return "HOLD";
}

/**
 * Reverse DCF: find the value of one numeric input that makes the scenario's price
 * equal the market price (bisection). Returns null if no solution lies in [lo, hi].
 */
export function solveForInput(
  s: ScenarioInputs,
  c: CompanyInputs,
  key: "fleetAtScale" | "revenuePerAircraftM" | "ebitdaMarginAtScale" | "discountRate",
  lo: number,
  hi: number,
  targetPrice = c.currentPrice,
): number | null {
  const f = (x: number) => runScenario({ ...s, [key]: x }, c).pricePerShare - targetPrice;
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fa * fb > 0) return null;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < 1e-6) return m;
    if (fa * fm < 0) b = m;
    else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
