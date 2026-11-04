/**
 * npm run briefing:check
 *
 * Lints content/briefing.md: front-matter, the six required sections, a scorecard
 * covering every area, a citation on every bullet, and (the key rule) that every
 * URL it cites appears in data/snapshot.json. Exits non-zero on errors.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectUrls, lintBriefing, parseBriefing } from "../src/lib/briefing";

const root = path.resolve(import.meta.dirname, "..");
const briefingPath = path.join(root, process.argv[2] ?? "content/briefing.md");
const snapshotPath = path.join(root, "data/snapshot.json");

const [text, snapText] = await Promise.all([readFile(briefingPath, "utf8").catch(() => null), readFile(snapshotPath, "utf8").catch(() => null)]);
if (text === null) {
  console.error(`✗ ${briefingPath} not found`);
  process.exit(1);
}
if (snapText === null) {
  console.error("✗ data/snapshot.json not found. Run: npm run snapshot");
  process.exit(1);
}
const snapshot = JSON.parse(snapText) as { generatedAt: string };
const meta = parseBriefing(text).meta;
const issues = lintBriefing(text, collectUrls(snapshot));
if (meta.data_as_of && meta.data_as_of !== snapshot.generatedAt) {
  issues.push({ level: "warning", message: `data_as_of (${meta.data_as_of}) differs from snapshot.generatedAt (${snapshot.generatedAt})` });
}
for (const i of issues) (i.level === "error" ? console.error : console.warn)(`${i.level === "error" ? "✗" : "⚠"} ${i.message}`);
const errors = issues.filter((i) => i.level === "error").length;
if (errors) process.exit(1);
console.log(`✓ ${path.relative(root, briefingPath)} passes (${meta.verdict} · target $${meta.price_target} · data as of ${meta.data_as_of})`);
