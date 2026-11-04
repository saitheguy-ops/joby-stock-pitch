/** Central configuration. No API keys are needed anywhere in this app. */

export const TICKER = "JOBY";
export const COMPANY_NAME = "Joby Aviation, Inc.";
/** SEC Central Index Key for Joby Aviation (zero-padded to 10 digits for data.sec.gov). */
export const JOBY_CIK = "0001819848";

/**
 * The SEC asks automated clients to send a descriptive User-Agent with contact info
 * (https://www.sec.gov/os/accessing-edgar-data). Set SEC_USER_AGENT in your environment,
 * e.g. "YourApp you@yourdomain.com". The default is generic and uses a reserved
 * example.com address, never a personal email.
 */
export const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT?.trim() || "joby-stock-pitch-educational-app admin@example.com";

/**
 * Publicly traded eVTOL / advanced-air-mobility candidates for the comps table.
 * Listing status is re-verified live from Yahoo on every refresh (see lib/comps.ts);
 * anything without a recent quote is shown as "not verified as listed".
 */
export const PEER_CANDIDATES: { ticker: string; note: string }[] = [
  { ticker: "ACHR", note: "Piloted eVTOL air taxi (Midnight); closest US pure-play peer" },
  { ticker: "BETA", note: "Electric CTOL/eVTOL (ALIA); cargo, defense and passenger" },
  { ticker: "EVEX", note: "eVTOL developer majority-owned by Embraer" },
  { ticker: "EH", note: "Autonomous passenger eVTOL (China); ADR listing" },
  { ticker: "EVTL", note: "Piloted eVTOL (VX4/Valo), UK; foreign private issuer" },
  { ticker: "HOVR", note: "Hybrid-electric VTOL (Cavorite X7), Canada; micro-cap" },
];

export const REVALIDATE_NOTE =
  "Market data refreshes about hourly; SEC data refreshes a few times a day.";
