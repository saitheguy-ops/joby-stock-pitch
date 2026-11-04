import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseBriefing, type Briefing } from "./briefing";
import type { Snapshot } from "./snapshot/types";

const ROOT = process.cwd();
export const BRIEFING_FILE = path.join(ROOT, "content", "briefing.md");
export const BRIEFINGS_DIR = path.join(ROOT, "content", "briefings");
export const SNAPSHOT_FILE = path.join(ROOT, "data", "snapshot.json");

export async function loadBriefing(): Promise<Briefing> {
  return parseBriefing(await readFile(BRIEFING_FILE, "utf8"));
}

export async function loadSnapshot(): Promise<Snapshot> {
  return JSON.parse(await readFile(SNAPSHOT_FILE, "utf8")) as Snapshot;
}

export interface ArchivedBriefing {
  file: string;
  date: string;
  verdict: string;
  priceTarget: number | null;
  priceAtWriting: number | null;
}

/** Dated copies in content/briefings/ (newest first). */
export async function listArchivedBriefings(): Promise<ArchivedBriefing[]> {
  const files = (await readdir(BRIEFINGS_DIR).catch(() => [] as string[])).filter((f) => f.endsWith(".md"));
  const items = await Promise.all(
    files.map(async (file) => {
      const b = parseBriefing(await readFile(path.join(BRIEFINGS_DIR, file), "utf8"));
      return { file, date: b.meta.date || file.replace(/\.md$/, ""), verdict: b.meta.verdict, priceTarget: b.meta.price_target, priceAtWriting: b.meta.price_at_writing };
    }),
  );
  return items.sort((a, b) => b.file.localeCompare(a.file));
}
