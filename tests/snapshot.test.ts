import { describe, expect, it } from "vitest";
import { computeReaction, extractDates, isUpcoming, toEastern, windowReturns, type Bar } from "@/lib/snapshot/market";
import { validateSnapshot } from "@/lib/snapshot/validate";

const src = { label: "test", url: "https://example.com", asOf: "2026-11-04" };

// Mon Nov 2 .. Fri Nov 6, 2026 (Nov 7-8 weekend), then Mon Nov 9.
const bars: Bar[] = [
  { date: "2026-11-02", close: 100 },
  { date: "2026-11-03", close: 110 },
  { date: "2026-11-04", close: 99 },
  { date: "2026-11-05", close: 108.9 },
  { date: "2026-11-06", close: 108.9 },
  { date: "2026-11-09", close: 98.01 },
];
const spy: Bar[] = bars.map((b, i) => ({ date: b.date, close: 500 + i }));
const later = "2026-11-20T00:00:00Z";

describe("toEastern", () => {
  it("converts UTC to US Eastern date and minutes", () => {
    // 20:03 UTC on Aug 5 (EDT, UTC-4) = 16:03 ET.
    expect(toEastern("2026-08-05T20:03:39Z")).toEqual({ date: "2026-08-05", minutes: 16 * 60 + 3 });
    // 02:00 UTC on Nov 4 (EST, UTC-5) is still Nov 3 in New York.
    expect(toEastern("2026-11-04T02:00:00Z").date).toBe("2026-11-03");
  });
});

describe("computeReaction", () => {
  it("uses the same session for news before the close", () => {
    const r = computeReaction("2026-11-03T15:00:00Z", bars, spy, later, src)!; // 10:00 ET
    expect(r.afterClose).toBe(false);
    expect(r.sameDaySession).toBe("2026-11-03");
    expect(r.sameDay).toBeCloseTo(0.1, 10);
    expect(r.nextDaySession).toBe("2026-11-04");
    expect(r.nextDay).toBeCloseTo(-0.1, 10);
    expect(r.firstReaction).toBeCloseTo(0.1, 10);
    expect(r.spySameDay).toBeCloseTo(501 / 500 - 1, 10);
    expect(r.partial).toBe(false);
  });

  it("uses the next session for news after the 4pm ET close", () => {
    const r = computeReaction("2026-11-04T21:05:00Z", bars, spy, later, src)!; // 4:05pm ET
    expect(r.afterClose).toBe(true);
    expect(r.firstReaction).toBeCloseTo(0.1, 10); // Nov 5 vs Nov 4
  });

  it("rolls weekend news to the next trading session", () => {
    const r = computeReaction("2026-11-07T15:00:00Z", bars, spy, later, src)!;
    expect(r.sameDaySession).toBeNull();
    expect(r.sameDay).toBeNull();
    expect(r.nextDaySession).toBe("2026-11-09");
    expect(r.firstReaction).toBeCloseTo(-0.1, 10);
  });

  it("flags today's still-open session as partial", () => {
    const r = computeReaction("2026-11-09T15:00:00Z", bars, spy, "2026-11-09T18:00:00Z", src)!; // 1pm ET
    expect(r.partial).toBe(true);
    expect(r.nextDay).toBeNull();
  });

  it("returns null when the event predates the price history", () => {
    expect(computeReaction("2026-10-01T15:00:00Z", bars, spy, later, src)).toBeNull();
  });
});

describe("windowReturns", () => {
  it("computes 1W and YTD from the last bar", () => {
    const series: Bar[] = [{ date: "2025-12-31", close: 50 }, ...Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${String(i + 2).padStart(2, "0")}`, close: 100 + i }))];
    const r = windowReturns(series);
    expect(r["1W"]).toBeCloseTo(109 / 104 - 1, 10);
    expect(r.YTD).toBeCloseTo(109 / 50 - 1, 10);
    expect(r["1Y"]).toBeNull(); // less than a year of history
    expect(r["3M"]).toBeNull();
  });
});

describe("extractDates", () => {
  it("finds day, month and year mentions without double counting", () => {
    const d = extractDates("The hearing is scheduled for January 2027, with a determination expected on May 14, 2027.", "2026-08-06");
    expect(d.map((x) => [x.date, x.precision])).toEqual([
      ["2027-01-01", "month"],
      ["2027-05-14", "day"],
    ]);
    expect(extractDates("We are targeting carrying our first passengers in 2026.", "2026-08-06")).toEqual([{ date: "2026-01-01", precision: "year", when: "2026" }]);
  });

  it("infers the year for 'Month Day' from the reference date", () => {
    expect(extractDates("Its November 4 report will show costs", "2026-11-04T14:52:00Z")[0]).toMatchObject({ date: "2026-11-04", precision: "day" });
  });

  it("isUpcoming compares at the right precision", () => {
    expect(isUpcoming({ date: "2026-01-01", precision: "year", when: "2026" }, "2026-11-04")).toBe(true);
    expect(isUpcoming({ date: "2026-10-01", precision: "month", when: "October 2026" }, "2026-11-04")).toBe(false);
    expect(isUpcoming({ date: "2026-11-04", precision: "day", when: "Nov 4" }, "2026-11-04")).toBe(true);
  });
});

describe("validateSnapshot", () => {
  const good = {
    schemaVersion: 1,
    generatedAt: "2026-11-04T19:00:00Z",
    ticker: "JOBY",
    sourcesStatus: [{ name: "x", ok: true }],
    price: { value: 5, source: src },
    performance: [{ ticker: "JOBY", returns: {}, source: src }],
    metrics: {},
    valuation: { weighted: {} },
    news: [{ title: "t", publishedAt: "2026-11-01T00:00:00Z", source: src }],
    filings: [],
    events: [{ date: "2027-01-01", source: src }],
  };

  it("accepts a well-formed snapshot", () => {
    const r = validateSnapshot(good, "2026-11-05T00:00:00Z");
    expect(r.errors).toEqual([]);
    expect(r.sourcesChecked).toBe(4);
  });

  it("rejects items without a source URL or date", () => {
    const bad = { ...good, news: [{ title: "t", publishedAt: "2026-11-01T00:00:00Z", source: { label: "x", url: "ftp://x", asOf: "soon" } }] };
    const r = validateSnapshot(bad, "2026-11-05T00:00:00Z");
    expect(r.errors.join(" ")).toMatch(/url missing/);
    expect(r.errors.join(" ")).toMatch(/asOf missing/);
  });

  it("rejects news outside the 60-day window and missing sections", () => {
    const { events: _events, ...noEvents } = good;
    void _events;
    const r = validateSnapshot({ ...noEvents, news: [{ title: "old", publishedAt: "2026-06-01T00:00:00Z", source: src }] }, "2026-11-05T00:00:00Z");
    expect(r.errors.join(" ")).toMatch(/older than 60 days/);
    expect(r.errors.join(" ")).toMatch(/Missing section: events/);
  });

  it("warns (not errors) when stale", () => {
    const r = validateSnapshot(good, "2026-12-01T00:00:00Z");
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/days old/);
  });
});
