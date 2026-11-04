/**
 * Risk themes for the Risks page. Each theme pulls matching bullets from the
 * live 10-K Risk Factors Summary and matching recent headlines, using the
 * regular expressions below (shown in the UI so the mapping is transparent).
 */

export type ThemeId = "regulatory" | "cash" | "manufacturing" | "competition" | "safety" | "partners" | "legal";

export interface RiskTheme {
  id: ThemeId;
  title: string;
  /** Plain-language framing: why this matters for the stock. */
  summary: string;
  /** What would show this risk is getting better or worse. */
  watch: string;
  filingRe: RegExp;
  newsRe: RegExp;
}

export const RISK_THEMES: RiskTheme[] = [
  {
    id: "regulatory",
    title: "Regulatory certification & launch timeline",
    summary:
      "Joby cannot fly paying passengers at scale in the US without FAA type certification (plus production and operating approvals). Every delay extends cash burn and pushes revenue out, which is why launch year is a top driver in the valuation.",
    watch: "FAA progress on the final certification stage (for-credit flight testing / type inspection), early operations under the eVTOL pilot program and in Dubai, and any change to the stated 2026 first-passenger target.",
    filingRe: /regulat|certif|approval|airspace|launching our commercial|security regulation/i,
    newsRe: /\b(faa|certif\w*|regulat\w*|type inspection|tia|approv\w*|gcaa|eipp|pilot program|delay\w*)\b/i,
  },
  {
    id: "cash",
    title: "Cash burn, funding & dilution",
    summary:
      "Joby burns hundreds of millions of dollars a year and has funded itself with stock sales, a Toyota investment and convertible notes. Runway buys time, but each raise dilutes existing holders, and raising at low prices transfers value to new investors.",
    watch: "Quarterly free-cash-flow burn vs. guidance, cash runway, new at-the-market or underwritten offerings, and the share count on each filing's cover page.",
    filingRe: /incurred significant losses|additional capital|dilut|resales of common stock|Toyota Investment|net operating loss|price of our common stock/i,
    newsRe: /\b(offering|dilut\w*|raise[sd]?|cash|burn|convertible|losses?|at-the-market|capital)\b/i,
  },
  {
    id: "manufacturing",
    title: "Manufacturing scale-up & supply chain",
    summary:
      "Building a few prototypes is very different from producing hundreds of certified aircraft a year at a cost that makes the service profitable. Production rate and cost per aircraft both feed directly into the valuation.",
    watch: "Production-certificate progress, the Toyota manufacturing partnership, aircraft delivered per quarter, and capex per aircraft.",
    filingRe: /produce|volumes|suppliers|maintenance|facilities|performance expectations|single type of aircraft|tariff/i,
    newsRe: /\b(manufactur\w*|production|factory|facilit\w*|supplier\w*|tariff\w*|toyota)\b/i,
  },
  {
    id: "competition",
    title: "Competition",
    summary:
      "Several well-funded companies (see the comps table) are racing to certify and launch similar aircraft, and ground transport and helicopters remain alternatives. Being second to market could cost routes, partners and pricing power.",
    watch: "Rivals' certification milestones and launch dates, especially Archer's, and Joby's share of early city and airline partnerships.",
    filingRe: /competitor|differentiate|commercialize their technology|ground transportation|consumer preferences/i,
    newsRe: /\b(archer|beta technologies|eve|ehang|vertical aerospace|competitor\w*|rival\w*)\b/i,
  },
  {
    id: "safety",
    title: "Safety & public acceptance",
    summary:
      "A new kind of aircraft flying over cities must prove it is safe and quiet, and customers must be willing to pay. An accident anywhere in the eVTOL industry could set back regulation and demand for everyone.",
    watch: "Incident reports across the industry, noise and community approvals for vertiports, early load factors and ticket prices.",
    filingRe: /crash|accident|incident|reluctance|adopt|unwilling|end-user pricing|weather|utilization|software code/i,
    newsRe: /\b(crash\w*|accident\w*|incident\w*|safety|noise|demand|public|passenger\w*)\b/i,
  },
  {
    id: "partners",
    title: "Dependence on partners & government",
    summary:
      "Joby leans on partners for capital, manufacturing, distribution and early revenue: Toyota, Uber, Delta and the Blade network (per the 10-K), and the US Department of Defense. Conflicts, terminated contracts or a partner's change in strategy would hurt.",
    watch: "Toyota funding closings, renewal or expansion of government contracts, and airline and ride-hail integration announcements.",
    filingRe: /partner|government contracts?|Department of Defense|U\.S\. government|third-party operators|Blade|Toyota/i,
    newsRe: /\b(toyota|uber|delta|air force|department of defense|dod|partner\w*|blade|contract\w*)\b/i,
  },
  {
    id: "legal",
    title: "Litigation & intellectual property",
    summary:
      "Joby is in litigation with Archer (trade-secret claims by Joby; an ITC patent complaint by Archer that seeks to block imports of components). An adverse ruling could affect the supply chain or create costs, and legal fees add to burn.",
    watch: "ITC investigation milestones (hearing, initial determination) and the California trade-secret case.",
    filingRe: /intellectual property|securities litigation|short-selling/i,
    newsRe: /\b(lawsuit|sues?|sued|itc|patent\w*|trade secret\w*|litigation|court)\b/i,
  },
];

export function matchBullets(theme: RiskTheme, bullets: string[], max = 5): string[] {
  return bullets.filter((b) => theme.filingRe.test(b)).slice(0, max);
}

export function matchHeadlines<T extends { title: string }>(theme: RiskTheme, items: T[], max = 3): T[] {
  return items.filter((n) => theme.newsRe.test(n.title)).slice(0, max);
}
