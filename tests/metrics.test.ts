import { describe, expect, it } from "vitest";
import { addQuarters, dilutionStats, freeCashFlowBurn, runwayQuarters } from "@/lib/metrics";

describe("cash burn and runway", () => {
  it("burn = -(operating cash flow - capex), positive when consuming cash", () => {
    expect(freeCashFlowBurn(-173, 60)).toBe(233);
    // Capex sign convention does not matter.
    expect(freeCashFlowBurn(-173, -60)).toBe(233);
    // A cash-generating company has negative burn.
    expect(freeCashFlowBurn(100, 20)).toBe(-80);
  });

  it("runway = cash and investments / quarterly burn", () => {
    expect(runwayQuarters(2264, 233)).toBeCloseTo(9.717, 3);
    expect(runwayQuarters(0, 100)).toBe(0);
  });

  it("runway is undefined (null) when the company is not burning", () => {
    expect(runwayQuarters(1000, 0)).toBeNull();
    expect(runwayQuarters(1000, -50)).toBeNull();
    expect(runwayQuarters(Number.NaN, 10)).toBeNull();
  });

  it("addQuarters projects the cash-out date", () => {
    expect(addQuarters("2026-06-30", 4)).toBe("2027-06-30");
  });
});

describe("dilution", () => {
  it("computes total, annualised dilution and ownership retained", () => {
    const d = dilutionStats([
      { date: "2022-06-30", shares: 600 },
      { date: "2026-06-30", shares: 1000 },
      { date: "2024-06-30", shares: 800 },
    ])!;
    expect(d.first.date).toBe("2022-06-30");
    expect(d.totalPct).toBeCloseTo(0.6667, 4);
    // (1000/600)^(1/4) - 1 ≈ 13.6% per year over ~4 years.
    expect(d.annualPct).toBeCloseTo(Math.pow(1000 / 600, 1 / 4.0014) - 1, 3);
    // A 1% holder in 2022 owns 0.6% in 2026 without buying more.
    expect(d.ownershipRetained).toBeCloseTo(0.6, 6);
    expect(d.points.map((p) => p.date)).toEqual(["2022-06-30", "2024-06-30", "2026-06-30"]);
  });

  it("needs at least two points", () => {
    expect(dilutionStats([{ date: "2026-01-01", shares: 1 }])).toBeNull();
  });
});
