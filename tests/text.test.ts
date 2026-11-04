import { describe, expect, it } from "vitest";
import { decodeEntities, extractMilestoneSentences, extractRiskSummary, htmlToText } from "@/lib/filing-text";
import { headlineKey, tagHeadline } from "@/lib/news-tag";

describe("filing text", () => {
  it("decodes numeric and named entities", () => {
    expect(decodeEntities("Joby&#8217;s &amp; Toyota&nbsp;&#x201C;JV&#x201D;")).toBe("Joby’s & Toyota “JV”");
  });

  it("strips tags and the inline-XBRL header", () => {
    expect(htmlToText("<ix:header>hidden</ix:header><p>Hello <b>world</b></p><div>Next</div>")).toBe("Hello world\nNext");
  });

  it("extracts grouped Risk Factors Summary bullets", () => {
    const text = [
      "Risk Factors Summary",
      "Our business is subject to a number of risks, including:",
      "Certification & Regulatory",
      "• We may be unable to obtain regulatory approvals.",
      "Table of Contents",
      "Market & Service",
      "• Consumers may not adopt this new form of mobility.",
      "• We may face delays in launching our commercial service.",
      "Item 1. Business",
      "• Not a risk bullet.",
    ].join("\n");
    const groups = extractRiskSummary(text);
    expect(groups.map((g) => g.heading)).toEqual(["Certification & Regulatory", "Market & Service"]);
    expect(groups[1].bullets).toHaveLength(2);
  });

  it("finds dated forward-looking milestones and skips boilerplate", () => {
    const text =
      "We are targeting carrying our first passengers in 2026. " +
      "These forward-looking statements speak only as of 2026 and we expect nothing. " +
      "Revenue was $10 million in 2025. " +
      "The evidentiary hearing is scheduled for January 2027, with the Initial Determination expected on May 14, 2027.";
    const s = extractMilestoneSentences(text, 2026);
    expect(s).toEqual([
      "We are targeting carrying our first passengers in 2026.",
      "The evidentiary hearing is scheduled for January 2027, with the Initial Determination expected on May 14, 2027.",
    ]);
  });
});

describe("headline tagging", () => {
  it("tags catalysts, risks and context", () => {
    expect(tagHeadline("Joby Begins Piloted Electric Air Taxi Flights Across Florida").tag).toBe("catalyst");
    expect(tagHeadline("Joby shares fall after $500 million stock offering").tag).toBe("risk");
    expect(tagHeadline("What to know about Joby Aviation").tag).toBe("context");
  });

  it("explains its decision with matched keywords", () => {
    expect(tagHeadline("Archer sues Joby at the ITC").matched).toContain("litigation");
  });

  it("normalises headlines for de-duplication across feeds", () => {
    expect(headlineKey("Joby Expands Air Force Contract - Reuters")).toBe(headlineKey("Joby expands Air Force contract!"));
  });
});
