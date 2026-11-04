/**
 * Pure text helpers for SEC filing HTML: convert to plain text and pull out the
 * 10-K "Risk Factors Summary" and forward-looking milestone sentences.
 */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", bull: "•", hellip: "…", reg: "®", trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, "")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export interface RiskGroup {
  heading: string;
  bullets: string[];
}

/**
 * Extract the bulleted "Risk Factors Summary" that appears near the front of a 10-K.
 * Group headings are the short, unpunctuated lines between bullets.
 */
export function extractRiskSummary(text: string): RiskGroup[] {
  const start = text.search(/Risk Factors Summary/i);
  if (start < 0) return [];
  const rest = text.slice(start);
  const endRel = rest.search(/\n\s*(Item 1\.\s*Business|Market and Industry Data|PART I\b)/i);
  const section = endRel > 0 ? rest.slice(0, endRel) : rest.slice(0, 20_000);
  const groups: RiskGroup[] = [];
  let current: RiskGroup = { heading: "General", bullets: [] };
  for (const raw of section.split("\n").slice(1)) {
    const line = raw.trim();
    if (!line || /^table of contents$/i.test(line) || /^\d+$/.test(line)) continue;
    if (line.startsWith("•") || line.startsWith("●") || line.startsWith("·")) {
      current.bullets.push(line.replace(/^[•●·]\s*/, ""));
    } else if (line.length < 90 && !/[.:;]$/.test(line)) {
      if (current.bullets.length) groups.push(current);
      current = { heading: line, bullets: [] };
    }
  }
  if (current.bullets.length) groups.push(current);
  return groups;
}

/**
 * Sentences that state a forward-looking target with a year, e.g.
 * "We are targeting carrying our first passengers in 2026." Boilerplate from the
 * forward-looking-statements legend is skipped.
 */
/** Split into sentences without letting headings (separate lines) bleed into them. */
export function splitSentences(text: string): string[] {
  return text
    .split("\n")
    // Split after . ! ? followed by a capital, but not after abbreviations like "U.S." or "Inc.".
    .flatMap((line) => line.split(/(?<!\b(?:U\.S|Inc|No|Mr|Ms|Dr|Co|Corp|Ltd|vs|e\.g|i\.e|St|Jr)\.)(?<=[.!?])\s+(?=[A-Z“"])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractMilestoneSentences(text: string, fromYear: number, max = 8): string[] {
  const sentences = splitSentences(text);
  const yearRe = new RegExp(`\\b(${Array.from({ length: 6 }, (_, i) => fromYear + i).join("|")})\\b`);
  const intentRe = /\b(target(ing|s|ed)?|expect(s|ed)?|plan(s|ned)?|anticipat\w*|intend(s|ed)?|goal|on track|aim(s|ing)?)\b/i;
  const boilerplate = /forward-looking|Private Securities Litigation|undue reliance|could cause actual results|accounting standard|ASU \d|effective for|adopt(ed|ion)? (of )?(the|this) (standard|guidance)|fiscal years? beginning|10b5-1|trading plan/i;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    if (s.length < 40 || s.length > 450) continue;
    if (!yearRe.test(s) || !intentRe.test(s) || boilerplate.test(s)) continue;
    const key = s.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Sentences mentioning any of the given terms (used for legal proceedings, partners, etc.). */
export function sentencesMatching(text: string, re: RegExp, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of splitSentences(text)) {
    if (t.length < 40 || t.length > 600 || !re.test(t)) continue;
    const key = t.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
