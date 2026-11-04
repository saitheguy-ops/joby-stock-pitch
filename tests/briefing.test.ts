import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ageInDays, collectUrls, findSection, lintBriefing, parseBriefing, parseEvents, parseFrontMatter, parseScorecard } from "@/lib/briefing";

const SAMPLE = `---
date: 2026-11-04
data_as_of: 2026-11-04T19:10:41.305Z
verdict: sell
price_target: $4.19
price_at_writing: 5.11
previous_verdict: SELL
previous_price_target: 4.19
previous_date: 2026-11-04
---

## Verdict and what changed since last time
- SELL, unchanged ([snapshot](https://example.com/a)).

## Status scorecard
- **Certification:** improving — stage 4 is ~75% complete ([10-Q](https://example.com/a))
- **Cash runway:** stable — ~11 quarters ([10-Q](https://example.com/a))
- **Dilution:** worsening — shares +64% ([10-Q](https://example.com/a))
- **Launch timeline:** stable — first passengers targeted in 2026 ([10-Q](https://example.com/a))
- **Partnerships/deals:** improving — Air Force contracts expanded ([news](https://example.com/b))

## What changed
- Something happened ([news](https://example.com/b)).

## What it means for the price
- Supports the base case ([model](https://example.com/a)).

## Upcoming events
- **2027-01-15** — ITC hearing — could block imports ([10-Q](https://example.com/a))

## Things to watch
- Quarterly burn above $250M ([10-Q](https://example.com/a)).
`;

describe("briefing parsing", () => {
  it("parses front-matter with normalisation", () => {
    const b = parseBriefing(SAMPLE);
    expect(b.meta.verdict).toBe("SELL");
    expect(b.meta.price_target).toBe(4.19);
    expect(b.meta.previous_date).toBe("2026-11-04");
    expect(parseFrontMatter("no front matter").data).toEqual({});
  });

  it("splits sections and parses the scorecard and events", () => {
    const b = parseBriefing(SAMPLE);
    expect(b.sections.map((s) => s.heading)).toHaveLength(6);
    const score = parseScorecard(findSection(b, "Status scorecard")!.markdown);
    expect(score.map((s) => [s.area, s.rating])).toEqual([
      ["Certification", "improving"],
      ["Cash runway", "stable"],
      ["Dilution", "worsening"],
      ["Launch timeline", "stable"],
      ["Partnerships/deals", "improving"],
    ]);
    expect(score[0].reason).toContain("([10-Q](https://example.com/a))");
    expect(parseEvents(findSection(b, "Upcoming events")!.markdown)).toEqual([{ when: "2027-01-15", text: "ITC hearing — could block imports ([10-Q](https://example.com/a))" }]);
  });

  it("computes age in days", () => {
    expect(ageInDays("2026-11-04T00:00:00Z", "2026-11-19T00:00:00Z")).toBe(15);
    expect(ageInDays("not a date", "2026-11-19T00:00:00Z")).toBeNull();
  });
});

describe("lintBriefing", () => {
  const allowed = new Set(["https://example.com/a", "https://example.com/b"]);

  it("passes a complete, cited briefing", () => {
    expect(lintBriefing(SAMPLE, allowed).filter((i) => i.level === "error")).toEqual([]);
  });

  it("flags uncited bullets, missing areas and URLs outside the snapshot", () => {
    const bad = SAMPLE.replace("- Something happened ([news](https://example.com/b)).", "- Something happened, trust me.")
      .replace("- **Dilution:** worsening — shares +64% ([10-Q](https://example.com/a))\n", "")
      .replace("https://example.com/b))\n\n## What changed", "https://not-in-snapshot.example/x))\n\n## What changed");
    const msgs = lintBriefing(bad, allowed).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/Uncited bullet in "What changed"/);
    expect(msgs).toMatch(/Scorecard is missing "Dilution"/);
    expect(msgs).toMatch(/URL not in snapshot: https:\/\/not-in-snapshot/);
  });

  it("collects every URL from a snapshot-like object", () => {
    expect([...collectUrls({ a: { url: "https://x.test/1" }, b: [{ source: { url: "https://x.test/2" } }], c: "plain" })]).toEqual(["https://x.test/1", "https://x.test/2"]);
  });
});

describe("committed content/briefing.md", () => {
  const root = path.resolve(__dirname, "..");
  const file = path.join(root, "content/briefing.md");
  const snapFile = path.join(root, "data/snapshot.json");

  it.skipIf(!existsSync(file))("is well-formed and cites only the snapshot it was written from", () => {
    const text = readFileSync(file, "utf8");
    const snap = existsSync(snapFile) ? JSON.parse(readFileSync(snapFile, "utf8")) : null;
    const meta = parseBriefing(text).meta;
    // URL check only applies when the snapshot on disk is the one the briefing was written from.
    const allowed = snap && snap.generatedAt === meta.data_as_of ? collectUrls(snap) : undefined;
    expect(lintBriefing(text, allowed).filter((i) => i.level === "error")).toEqual([]);
  });
});
