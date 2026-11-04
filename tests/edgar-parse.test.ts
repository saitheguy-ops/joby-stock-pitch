import { describe, expect, it } from "vitest";
import {
  annualDurations,
  dedupeFacts,
  fiscalYearEnds,
  instants,
  quarterlyDurations,
  trailingSum,
  type RawFact,
} from "@/lib/edgar-parse";

const f = (start: string | undefined, end: string, val: number, filed: string, form = "10-Q"): RawFact => ({
  start,
  end,
  val,
  accn: `0000-${filed}`,
  form,
  filed,
});

describe("dedupeFacts", () => {
  it("keeps the most recently filed value for a period (restatements win)", () => {
    const out = dedupeFacts([
      f("2025-01-01", "2025-06-30", -100, "2025-08-07"),
      f("2025-01-01", "2025-06-30", -105, "2026-08-06"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].val).toBe(-105);
  });

  it("drops non-periodic forms such as 8-K and S-1", () => {
    expect(dedupeFacts([f(undefined, "2025-06-30", 1, "2025-08-01", "8-K")])).toHaveLength(0);
  });
});

describe("quarterlyDurations", () => {
  // Cash-flow style: only year-to-date values are reported.
  const ytd = dedupeFacts([
    f("2026-01-01", "2026-03-31", -144, "2026-05-06"),
    f("2026-01-01", "2026-06-30", -318, "2026-08-06"),
    f("2025-01-01", "2025-09-30", -357, "2025-11-06"),
    f("2025-01-01", "2025-06-30", -218, "2025-08-07"),
    f("2025-01-01", "2025-12-31", -510, "2026-02-27", "10-K"),
  ]);

  it("derives Q2 as H1 minus Q1", () => {
    const q = quarterlyDurations(ytd);
    const q2 = q.find((p) => p.end === "2026-06-30")!;
    expect(q2.val).toBe(-174);
    expect(q2.start).toBe("2026-03-31");
    expect(q2.derived).toBe(true);
  });

  it("derives Q4 as full year minus nine months", () => {
    const q4 = quarterlyDurations(ytd).find((p) => p.end === "2025-12-31")!;
    expect(q4.val).toBe(-153);
  });

  it("uses a directly reported three-month value when present", () => {
    const q1 = quarterlyDurations(ytd).find((p) => p.end === "2026-03-31")!;
    expect(q1.val).toBe(-144);
    expect(q1.derived).toBeUndefined();
  });

  it("prefers a reported 3-month figure over a derived one", () => {
    const pts = dedupeFacts([
      f("2026-01-01", "2026-06-30", -300, "2026-08-06"),
      f("2026-04-01", "2026-06-30", -170, "2026-08-06"),
      f("2026-01-01", "2026-03-31", -140, "2026-05-06"),
    ]);
    const q2 = quarterlyDurations(pts).find((p) => p.end === "2026-06-30")!;
    expect(q2.val).toBe(-170);
    expect(q2.derived).toBeUndefined();
  });
});

describe("annual and instant helpers", () => {
  it("annualDurations keeps ~12-month periods only", () => {
    const pts = dedupeFacts([
      f("2025-01-01", "2025-12-31", 10, "2026-02-27", "10-K"),
      f("2025-01-01", "2025-09-30", 7, "2025-11-06"),
    ]);
    expect(annualDurations(pts).map((p) => p.val)).toEqual([10]);
  });

  it("instants + fiscalYearEnds keep Dec 31 balances", () => {
    const pts = dedupeFacts([
      f(undefined, "2025-12-31", 5, "2026-02-27", "10-K"),
      f(undefined, "2026-06-30", 6, "2026-08-06"),
    ]);
    const all = instants(pts);
    expect(all).toHaveLength(2);
    expect(fiscalYearEnds(all).map((p) => p.end)).toEqual(["2025-12-31"]);
  });

  it("trailingSum needs four contiguous quarters", () => {
    const q = quarterlyDurations(
      dedupeFacts([
        f("2025-07-01", "2025-09-30", -1, "x1"),
        f("2025-10-01", "2025-12-31", -2, "x2"),
        f("2026-01-01", "2026-03-31", -3, "x3"),
        f("2026-04-01", "2026-06-30", -4, "x4"),
      ]),
    );
    expect(trailingSum(q, 4)?.val).toBe(-10);
    expect(trailingSum(q.slice(0, 3), 4)).toBeNull();
    // A gap (missing quarter) invalidates the trailing sum.
    expect(trailingSum([q[0], q[1], q[3], q[3]], 4)).toBeNull();
  });
});
