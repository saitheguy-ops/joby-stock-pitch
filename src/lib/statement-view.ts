import { JOBY_CIK } from "./config";
import type { LineItem } from "./edgar";
import { lastN, type Point } from "./edgar-parse";
import { fmtStatement, periodLabel } from "./format";
import { secFilingIndexUrl } from "./sources";
import type { StatementView } from "@/components/StatementTable";

/** Build an annual or quarterly table view (most recent `n` periods, oldest left). */
export function buildView(items: LineItem[], mode: "annual" | "quarterly", n: number): StatementView {
  const pick = (l: LineItem) => (mode === "annual" ? l.annual : l.quarterly);
  // Column set: period ends present in the anchor rows (fall back to all rows).
  const ends = new Set<string>();
  const QUARTER_ENDS = /-(03-31|06-30|09-30|12-31)$/;
  for (const l of items) for (const p of pick(l)) if (QUARTER_ENDS.test(p.end)) ends.add(p.end);
  // Quarterly instants include fiscal year ends too, which is what we want (Q4 balance sheet).
  const sorted = [...ends].sort();
  const cols = lastN(sorted, n);
  return {
    columns: cols.map((end) => ({ label: periodLabel(end, mode === "annual"), sub: end })),
    rows: items.map((l) => {
      const byEnd = new Map<string, Point>(pick(l).map((p) => [p.end, p]));
      return {
        label: l.label,
        concept: l.computed ? l.concept : `us-gaap:${l.concept}`,
        emphasis: l.emphasis,
        note: l.note,
        computed: l.computed,
        cells: cols.map((end) => {
          const p = byEnd.get(end);
          if (!p) return null;
          return {
            display: fmtStatement(p.val, l.unit),
            url: secFilingIndexUrl(JOBY_CIK, p.accn),
            title: `${l.computed ? l.concept : `us-gaap:${l.concept}`}\n${p.start ? `${p.start} to ` : "as of "}${p.end}\nSource: SEC ${p.form} filed ${p.filed}${p.derived ? "\nQuarter derived from year-to-date figures" : ""}`,
            derived: p.derived,
          };
        }),
      };
    }),
  };
}
