import assumptions from "../../content/assumptions.json";
import type { ScenarioInputs } from "./valuation";

/**
 * Default scenario assumptions live in content/assumptions.json so a briefing
 * refresh can change them (with a logged reason) without touching code. They are
 * MY assumptions, not company guidance or facts; each is explained below and
 * editable in the UI. Live, sourced inputs (cash, debt, shares, price, burn) come
 * from SEC EDGAR and Yahoo instead.
 *
 * `preLaunchBurnM` is filled in at runtime from the trailing-four-quarter
 * free-cash-flow burn reported in Joby's filings.
 */
export const DEFAULT_SCENARIOS = assumptions.scenarios as Omit<ScenarioInputs, "preLaunchBurnM">[];
export const ASSUMPTIONS_AS_OF: string = assumptions.asOf;
export const ASSUMPTIONS_CHANGELOG: { date: string; change: string; reason: string; sources: string[] }[] = assumptions.changelog;

/** Scenario narratives shown above the inputs. */
export const SCENARIO_STORIES: Record<ScenarioInputs["id"], string> = {
  bear: "Certification slips to 2029, early utilization disappoints, aircraft stay expensive to build, and Joby has to raise a lot of equity at low prices to survive the extra years of burn.",
  base: "FAA type certification and scaled US commercial service in 2027, after early operations (e.g. Dubai and the US eVTOL pilot program); a steady ramp to ~800 aircraft over eight years with premium pricing and airline-like margins.",
  bull: "Launch on schedule with a fast production ramp (Toyota manufacturing partnership), ~2,500 aircraft by 2035, lower aircraft cost and higher utilization; Joby becomes the category leader.",
};

export type AssumptionKey = Exclude<keyof ScenarioInputs, "id" | "name" | "terminalMethod">;

export interface AssumptionDoc {
  key: AssumptionKey;
  label: string;
  unit: "year" | "count" | "$M" | "%" | "x" | "years";
  step: number;
  min: number;
  max: number;
  /** Plain-language definition. */
  what: string;
  /** Why it matters / how the default was chosen. */
  why: string;
}

export const ASSUMPTION_DOCS: AssumptionDoc[] = [
  {
    key: "probability",
    label: "Probability",
    unit: "%",
    step: 0.05,
    min: 0,
    max: 1,
    what: "How likely you think this scenario is. The three weights are normalised to 100%.",
    why: "The probability-weighted target is Σ probability × price, so weights matter as much as the scenarios. Defaults are symmetric (25/50/25) to avoid a thumb on the scale.",
  },
  {
    key: "launchYear",
    label: "Commercial launch year",
    unit: "year",
    step: 1,
    min: 2026,
    max: 2035,
    what: "First year of scaled commercial passenger service, which in the US requires FAA type certification.",
    why: "Every year of delay adds roughly a year of cash burn and pushes all future profits further out (discounted more). Joby's 10-Q targets first passengers in 2026 and reports it is about 75% through stage 4 of 5 for type certification; the base case assumes scaled US service in 2027.",
  },
  {
    key: "fleetAtLaunch",
    label: "Aircraft in service at launch",
    unit: "count",
    step: 5,
    min: 0,
    max: 500,
    what: "Aircraft flying commercially at the end of the launch year.",
    why: "Sets the starting point of the ramp. Small effect on value, but it drives early capex.",
  },
  {
    key: "fleetAtScale",
    label: "Aircraft in service at scale",
    unit: "count",
    step: 50,
    min: 0,
    max: 20000,
    what: "Fleet size once the ramp is complete (the terminal year).",
    why: "The biggest value driver: revenue, EBITDA and the terminal value all scale with it. My assumption, not guidance; production capacity (incl. the Toyota partnership) and demand both cap it.",
  },
  {
    key: "yearsToScale",
    label: "Years from launch to scale",
    unit: "years",
    step: 1,
    min: 1,
    max: 15,
    what: "How long the fleet takes to grow linearly from launch size to scale size.",
    why: "A slower ramp means more years of losses before margins arrive, and a terminal value further in the future.",
  },
  {
    key: "revenuePerAircraftM",
    label: "Revenue per aircraft / yr",
    unit: "$M",
    step: 0.1,
    min: 0,
    max: 20,
    what: "Annual revenue each aircraft in service generates.",
    why: "Back-of-envelope for the $3.0M base: 20 flights/day × 300 days × 4 seats × 70% load × ~$180/seat ≈ $3.0M. Utilization and pricing are unproven: no eVTOL has flown commercial passengers at scale in the US.",
  },
  {
    key: "ebitdaMarginAtScale",
    label: "EBITDA margin at scale",
    unit: "%",
    step: 0.01,
    min: -0.5,
    max: 0.7,
    what: "Operating profit before depreciation, as a share of revenue, once the fleet is at scale.",
    why: "Converts revenue into cash. Until scale, the model blends from today's burn toward this margin. 30% sits between airlines (low teens) and asset-light platforms; pilots, batteries, maintenance and vertiports all eat into it.",
  },
  {
    key: "costPerAircraftM",
    label: "Cost per new aircraft",
    unit: "$M",
    step: 0.1,
    min: 0,
    max: 20,
    what: "Capital spent to build or buy each additional aircraft.",
    why: "Growing the fleet consumes cash before it earns any. If Joby owns and operates its fleet, this capex sits on its own balance sheet. Unknown publicly, so this is an assumption to stress-test.",
  },
  {
    key: "preLaunchBurnM",
    label: "Annual burn before launch",
    unit: "$M",
    step: 10,
    min: 0,
    max: 5000,
    what: "Free-cash-flow burn per year until revenue ramps (operating cash flow minus capex).",
    why: "Defaults to Joby's actual trailing-four-quarter burn from SEC filings. Burn has been rising, so holding it flat is generous.",
  },
  {
    key: "taxRate",
    label: "Tax rate",
    unit: "%",
    step: 0.01,
    min: 0,
    max: 0.4,
    what: "Cash tax rate on positive EBITDA.",
    why: "21% US federal rate. Conservative: Joby's large accumulated deficit likely creates loss carryforwards that would shield early profits.",
  },
  {
    key: "discountRate",
    label: "Discount rate",
    unit: "%",
    step: 0.005,
    min: 0.05,
    max: 0.4,
    what: "Annual return an investor demands for this risk; future cash is divided by (1 + rate)^years.",
    why: "Pre-revenue companies are typically valued with 12 to 20%+ rates because they are risky and need years to produce cash. Small changes move value a lot because most of it is far in the future.",
  },
  {
    key: "exitMultiple",
    label: "Terminal EV/EBITDA",
    unit: "x",
    step: 0.5,
    min: 0,
    max: 50,
    what: "Value of the business at the end of the forecast, as a multiple of that year's EBITDA.",
    why: "Usually the largest share of value for a long-dated growth company. 12x is in the range of mature transport/industrial companies; a still-growing leader could earn more.",
  },
  {
    key: "terminalGrowth",
    label: "Terminal growth (if used)",
    unit: "%",
    step: 0.005,
    min: -0.02,
    max: 0.1,
    what: "Perpetual growth after the forecast, used only with the growth method (Gordon growth).",
    why: "Must stay below the discount rate. Long-run growth near GDP (2 to 4%) is the convention.",
  },
  {
    key: "futureDilution",
    label: "Future dilution",
    unit: "%",
    step: 0.05,
    min: 0,
    max: 3,
    what: "Extra shares issued beyond today's count (stock compensation, plus equity raised at prices below intrinsic value).",
    why: "The DCF already subtracts all future cash burn, so this should not be the full share issuance needed to fund it (that would double count). It captures the value transfer to new shareholders and employees. For scale, see the live share-count history on the Financials page.",
  },
];
