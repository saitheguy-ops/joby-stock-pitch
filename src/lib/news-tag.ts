/**
 * Transparent keyword tagging for headlines. We do not use an opaque model: each
 * tag lists the exact keywords that triggered it, and the UI shows them, so a
 * reader can judge (and disagree with) the classification.
 */

export type NewsTag = "catalyst" | "risk" | "mixed" | "context";

const CATALYST: [RegExp, string][] = [
  [/\bcertif(y|ied|ication)\b/i, "certification"],
  [/\b(faa|gcaa|caa)\b.*\b(approv|grant|award|issu)/i, "regulator approval"],
  [/\btype inspection|\btia\b|for[- ]credit/i, "type inspection"],
  [/\blaunch(es|ed)?\b|\bbegins?\b|\bstarts?\b|\bcommenc|\bkicks? off\b/i, "launch/start"],
  [/\bfirst (passenger|commercial|flight)/i, "first flight/passenger"],
  [/\bcontract|\border(s|ed)?\b|\bagreement\b|\bpartner(ship)?\b|\bdeal\b/i, "contract/partnership"],
  [/\bfunding\b|\binvest(s|ment)\b(?!.*\boffering)/i, "funding/investment"],
  [/\bexpand(s|ed|ing)?\b|\brecord\b|\bmilestone\b|\bdeliver(s|ed|y)\b/i, "expansion/milestone"],
  [/\b(rises?|jumps?|soars?|surges?|gains?|rall(y|ies)|upgrade[sd]?)\b/i, "positive price move"],
];

const RISK: [RegExp, string][] = [
  [/\bdelay(s|ed)?\b|\bpush(es|ed)? back\b|\bslip(s|ped)?\b/i, "delay"],
  [/\blawsuit|\bsu(e|es|ed|ing)\b|\blitigation|\bitc\b|\bpatent|\btrade secret/i, "litigation"],
  [/\bcrash|\baccident|\bincident|\bmishap|\bntsb\b/i, "safety incident"],
  [/\binvestigat|\bprobe\b|\bsubpoena|\bclass action/i, "investigation"],
  [/\boffering\b|\bdilut|\bat[- ]the[- ]market\b|\bconvertible\b|\b(share|stock) sale\b|\bjoby raises\b.*\b(capital|stock|shares)\b/i, "equity raise/dilution"],
  [/\b(falls?|drops?|plunges?|slumps?|sinks?|tumbles?|slides?|downgrade[sd]?|sell[- ]off)\b/i, "negative price move"],
  [/\bloss(es)?\b|\bmiss(es|ed)?\b|\bburn\b/i, "losses/miss"],
  [/\blayoffs?\b|\bcuts?\b|\bwarn(s|ing)?\b|\bshort seller|\bbubble\b/i, "warning/cuts"],
  [/\b(sells?|sold|offloads?|dumps?)\b.*\bshares\b|\bform (4|144)\b|\binsider sell/i, "insider selling"],
  [/\b(beats?|ahead of|overtakes?)\s+(archer and\s+)?joby\b/i, "competitor ahead"],
];

export interface TagResult {
  tag: NewsTag;
  matched: string[];
}

export function tagHeadline(title: string): TagResult {
  const pos = CATALYST.filter(([re]) => re.test(title)).map(([, why]) => why);
  const neg = RISK.filter(([re]) => re.test(title)).map(([, why]) => why);
  if (pos.length && neg.length) {
    if (pos.length > neg.length) return { tag: "catalyst", matched: [...pos, ...neg.map((n) => `(also: ${n})`)] };
    if (neg.length > pos.length) return { tag: "risk", matched: [...neg, ...pos.map((p) => `(also: ${p})`)] };
    return { tag: "mixed", matched: [...pos, ...neg] };
  }
  if (pos.length) return { tag: "catalyst", matched: pos };
  if (neg.length) return { tag: "risk", matched: neg };
  return { tag: "context", matched: [] };
}

/** Normalise a headline for de-duplication across feeds. */
export function headlineKey(title: string): string {
  return title
    .replace(/\s+-\s+[^-]+$/, "") // Google News appends " - Publisher"
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}
