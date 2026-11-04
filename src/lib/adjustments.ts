import type { Source } from "./sources";

/**
 * Known cash events announced AFTER the latest balance sheet that the balance sheet
 * cannot yet reflect. Curated by hand from SEC 8-Ks (each with a link), and applied
 * only while the latest balance-sheet date is before `appliesIfBalanceSheetBefore`.
 *
 * When a later 10-Q shows the event has happened, the cash figure already includes
 * it, so the adjustment stops applying automatically for balance sheets dated after
 * the cutoff. Review this list after each 10-Q.
 */
export interface CashAdjustment {
  id: string;
  label: string;
  /** Signed cash impact in USD (negative = cash out). */
  cashImpact: number;
  explanation: string;
  appliesIfBalanceSheetBefore: string;
  source: Source;
}

export const PENDING_CASH_ADJUSTMENTS: CashAdjustment[] = [
  {
    id: "resonant",
    label: "Pending Resonant Sciences acquisition (cash portion)",
    cashImpact: -450e6,
    explanation:
      "On Aug 8, 2026 Joby agreed to buy Strix Holdings (Resonant Sciences) for a $500M base price, paid in cash except ~$50M of stock to management. Base price is subject to closing adjustments; check later filings for whether and when it closed.",
    appliesIfBalanceSheetBefore: "2026-08-08",
    source: {
      label: "SEC 8-K filed 2026-08-11 · Item 1.01 Stock Purchase Agreement",
      url: "https://www.sec.gov/Archives/edgar/data/1819848/000162828026055505/joby-20260808.htm",
      asOf: "2026-08-11",
    },
  },
];

export function applicableAdjustments(balanceSheetDate: string | null): CashAdjustment[] {
  if (!balanceSheetDate) return [];
  return PENDING_CASH_ADJUSTMENTS.filter((a) => balanceSheetDate < a.appliesIfBalanceSheetBefore);
}
