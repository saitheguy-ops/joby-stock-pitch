import { describe, expect, it } from "vitest";
import {
  discountFactor,
  fleetAt,
  probabilityWeighted,
  rampWeight,
  recommend,
  runScenario,
  sensitivityGrid,
  solveForInput,
  tornado,
  type CompanyInputs,
  type ScenarioInputs,
} from "@/lib/valuation";

const company: CompanyInputs = {
  firstForecastYear: 2027,
  cashAndInvestmentsM: 1000,
  debtM: 200,
  stubBurnM: 100,
  sharesM: 100,
  currentPrice: 10,
};

const scenario: ScenarioInputs = {
  id: "base",
  name: "Base",
  probability: 0.5,
  launchYear: 2028,
  fleetAtLaunch: 10,
  fleetAtScale: 110,
  yearsToScale: 2,
  revenuePerAircraftM: 2,
  ebitdaMarginAtScale: 0.5,
  costPerAircraftM: 1,
  preLaunchBurnM: 100,
  taxRate: 0.2,
  discountRate: 0.1,
  terminalMethod: "multiple",
  exitMultiple: 10,
  terminalGrowth: 0.02,
  futureDilution: 0.25,
};

describe("building blocks", () => {
  it("discount factor = 1 / (1 + r)^n", () => {
    expect(discountFactor(0.1, 0)).toBe(1);
    expect(discountFactor(0.1, 2)).toBeCloseTo(1 / 1.21, 12);
  });

  it("fleet ramps linearly from launch to scale and stays flat after", () => {
    expect(fleetAt(scenario, 2027)).toBe(0);
    expect(fleetAt(scenario, 2028)).toBe(10);
    expect(fleetAt(scenario, 2029)).toBe(60);
    expect(fleetAt(scenario, 2030)).toBe(110);
    expect(fleetAt(scenario, 2035)).toBe(110);
  });

  it("ramp weight goes 0 → 1 between launch and scale", () => {
    expect(rampWeight(scenario, 2027)).toBe(0);
    expect(rampWeight(scenario, 2028)).toBe(0);
    expect(rampWeight(scenario, 2029)).toBe(0.5);
    expect(rampWeight(scenario, 2030)).toBe(1);
  });
});

describe("runScenario (hand-computed example)", () => {
  // 2027: pre-launch. EBITDA = -100, capex 0, FCF = -100.
  // 2028: launch. fleet 0→10, avg 5, revenue 10; w = 0 → EBITDA -100; capex 10 → FCF -110.
  // 2029: fleet 10→60, avg 35, revenue 70; w = .5 → EBITDA .5*.5*70 - .5*100 = -32.5; capex 50 → FCF -82.5.
  // 2030: fleet 60→110, avg 85, revenue 170; w = 1 → EBITDA 85; tax 17; capex 50 → FCF 18.
  // TV (multiple) = 10 × 85 = 850 at 2030 (4 periods).
  const r = runScenario(scenario, company);

  it("projects the expected rows", () => {
    expect(r.rows.map((x) => x.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(r.rows.map((x) => x.revenueM)).toEqual([0, 10, 70, 170]);
    expect(r.rows.map((x) => x.ebitdaM)).toEqual([-100, -100, -32.5, 85]);
    expect(r.rows.map((x) => x.capexM)).toEqual([0, 10, 50, 50]);
    expect(r.rows.map((x) => x.taxM)).toEqual([0, 0, 0, 17]);
    expect(r.rows.map((x) => x.fcfM)).toEqual([-100, -110, -82.5, 18]);
  });

  it("discounts cash flows and the terminal value correctly", () => {
    const pv = -100 / 1.1 - 110 / 1.1 ** 2 - 82.5 / 1.1 ** 3 + 18 / 1.1 ** 4;
    const pvTv = 850 / 1.1 ** 4;
    expect(r.sumPvFcfM).toBeCloseTo(pv, 9);
    expect(r.terminalValueM).toBe(850);
    expect(r.pvTerminalM).toBeCloseTo(pvTv, 9);
    expect(r.enterpriseValueM).toBeCloseTo(pv + pvTv, 9);
  });

  it("bridges EV to equity and per-share value with dilution", () => {
    const equity = r.enterpriseValueM + 1000 - 200 - 100;
    expect(r.equityValueM).toBeCloseTo(equity, 9);
    expect(r.dilutedSharesM).toBe(125);
    expect(r.pricePerShare).toBeCloseTo(equity / 125, 9);
    expect(r.upside).toBeCloseTo(equity / 125 / 10 - 1, 9);
  });

  it("tracks the peak funding gap", () => {
    // Cash after stub: 900; cumulative: 800, 690, 607.5, 625.5 -> never negative.
    expect(r.peakFundingNeedM).toBe(0);
    const poor = runScenario({ ...scenario, preLaunchBurnM: 600 }, company);
    expect(poor.peakFundingNeedM).toBeLessThan(0);
  });

  it("supports the perpetual-growth terminal value", () => {
    const g = runScenario({ ...scenario, terminalMethod: "growth" }, company);
    // Next-year FCF = 85×1.02×(1−0.2) − 110×0.02×1 = 69.36 − 2.2 = 67.16; TV = 67.16 / (0.10 − 0.02).
    expect(g.terminalValueM).toBeCloseTo(67.16 / 0.08, 9);
  });

  it("guards against discount rate ≤ growth", () => {
    const g = runScenario({ ...scenario, terminalMethod: "growth", terminalGrowth: 0.12 }, company);
    expect(g.terminalValueM).toBe(0);
    expect(g.warnings.join(" ")).toMatch(/exceed terminal growth/);
  });

  it("floors the share price at zero when equity is negative", () => {
    const bad = runScenario({ ...scenario, preLaunchBurnM: 5000, launchYear: 2035 }, company);
    expect(bad.equityValueM).toBeLessThan(0);
    expect(bad.pricePerShare).toBe(0);
  });

  it("is monotonic in the key drivers", () => {
    const p = (s: Partial<ScenarioInputs>) => runScenario({ ...scenario, ...s }, company).pricePerShare;
    expect(p({ discountRate: 0.08 })).toBeGreaterThan(p({ discountRate: 0.12 }));
    expect(p({ launchYear: 2028 })).toBeGreaterThan(p({ launchYear: 2030 }));
    expect(p({ fleetAtScale: 200 })).toBeGreaterThan(p({ fleetAtScale: 110 }));
    expect(p({ futureDilution: 0 })).toBeGreaterThan(p({ futureDilution: 0.5 }));
  });
});

describe("probability weighting and recommendation", () => {
  it("computes Σ p × price", () => {
    const w = probabilityWeighted(
      [
        { id: "bear", probability: 0.25, price: 0 },
        { id: "base", probability: 0.5, price: 4 },
        { id: "bull", probability: 0.25, price: 20 },
      ],
      5,
    );
    expect(w.target).toBeCloseTo(7, 12);
    expect(w.low).toBe(0);
    expect(w.high).toBe(20);
    expect(w.upside).toBeCloseTo(0.4, 12);
  });

  it("normalises weights that do not sum to one", () => {
    const w = probabilityWeighted(
      [
        { id: "bear", probability: 1, price: 2 },
        { id: "base", probability: 1, price: 4 },
        { id: "bull", probability: 2, price: 10 },
      ],
      5,
    );
    expect(w.weights.map((x) => x.weight)).toEqual([0.25, 0.25, 0.5]);
    expect(w.target).toBeCloseTo(6.5, 12);
  });

  it("falls back to equal weights when all probabilities are zero", () => {
    const w = probabilityWeighted(
      [
        { id: "bear", probability: 0, price: 3 },
        { id: "bull", probability: 0, price: 9 },
      ],
      6,
    );
    expect(w.target).toBe(6);
  });

  it("maps upside to BUY / HOLD / SELL with a ±15% band", () => {
    expect(recommend(0.2)).toBe("BUY");
    expect(recommend(0.15)).toBe("HOLD");
    expect(recommend(-0.1)).toBe("HOLD");
    expect(recommend(-0.2)).toBe("SELL");
  });
});

describe("sensitivity, reverse DCF and tornado", () => {
  it("sensitivity grid matches individual runs", () => {
    const grid = sensitivityGrid(scenario, company, [0.08, 0.12], [2028, 2029]);
    expect(grid).toHaveLength(2);
    expect(grid[1][1]).toBeCloseTo(runScenario({ ...scenario, discountRate: 0.12, launchYear: 2029 }, company).pricePerShare, 12);
  });

  it("solves for the input that reproduces a target price", () => {
    const target = runScenario({ ...scenario, fleetAtScale: 300 }, company).pricePerShare;
    const solved = solveForInput(scenario, company, "fleetAtScale", 0, 10_000, target);
    expect(solved).not.toBeNull();
    expect(solved!).toBeCloseTo(300, 3);
  });

  it("returns null when no value in range reaches the target", () => {
    expect(solveForInput(scenario, company, "fleetAtScale", 0, 1, 1e6)).toBeNull();
  });

  it("tornado ranks drivers by swing, largest first", () => {
    const bars = tornado(scenario, company);
    expect(bars.length).toBeGreaterThan(5);
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1].swing).toBeGreaterThanOrEqual(bars[i].swing);
    const fleet = bars.find((b) => b.key === "fleetAtScale")!;
    expect(fleet.highPrice).toBeGreaterThan(fleet.lowPrice);
  });
});
