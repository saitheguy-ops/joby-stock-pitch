/**
 * npm run snapshot:check
 *
 * Validates data/snapshot.json: schema version, required sections, a URL and as-of
 * date on every sourced item, news within the 60-day window, and freshness.
 * Exits non-zero on errors; staleness and source outages are warnings.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateSnapshot } from "../src/lib/snapshot/validate";

const file = path.resolve(import.meta.dirname, "..", process.argv[2] ?? "data/snapshot.json");

const text = await readFile(file, "utf8").catch(() => null);
if (text === null) {
  console.error(`✗ ${file} not found. Run: npm run snapshot`);
  process.exit(1);
}
let parsed: unknown;
try {
  parsed = JSON.parse(text);
} catch (e) {
  console.error(`✗ ${file} is not valid JSON: ${(e as Error).message}`);
  process.exit(1);
}
const { errors, warnings, sourcesChecked } = validateSnapshot(parsed);
for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  console.error(`✗ ${errors.length} error(s):\n  ` + errors.join("\n  "));
  process.exit(1);
}
const s = parsed as { generatedAt: string; news: unknown[]; filings: unknown[]; events: unknown[] };
console.log(`✓ ${path.relative(process.cwd(), file)} is valid · generated ${s.generatedAt} · ${sourcesChecked} sourced items · ${s.news.length} news · ${s.filings.length} filings · ${s.events.length} events`);
