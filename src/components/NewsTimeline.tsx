"use client";

import { useMemo, useState } from "react";
import type { NewsTag } from "@/lib/news-tag";

export interface TimelineItem {
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string;
  feed: string;
  tag: NewsTag;
  matched: string[];
  jobySpecific: boolean;
}

const TAG_META: Record<NewsTag, { label: string; icon: string; cls: string }> = {
  catalyst: { label: "Catalyst", icon: "▲", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
  risk: { label: "Risk", icon: "▼", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300" },
  mixed: { label: "Mixed", icon: "◆", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
  context: { label: "Context", icon: "●", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export function TagPill({ tag, matched }: { tag: NewsTag; matched: string[] }) {
  const m = TAG_META[tag];
  return (
    <span title={matched.length ? `Auto-tagged from keywords: ${matched.join(", ")}` : "No catalyst/risk keywords matched"} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export function NewsTimeline({ items }: { items: TimelineItem[] }) {
  const [tag, setTag] = useState<NewsTag | "all">("all");
  const [jobyOnly, setJobyOnly] = useState(true);
  const [limit, setLimit] = useState(30);
  const filtered = useMemo(() => items.filter((n) => (tag === "all" || n.tag === tag) && (!jobyOnly || n.jobySpecific)), [items, tag, jobyOnly]);
  const counts = useMemo(() => {
    const base = items.filter((n) => !jobyOnly || n.jobySpecific);
    return { all: base.length, catalyst: base.filter((n) => n.tag === "catalyst").length, risk: base.filter((n) => n.tag === "risk").length, mixed: base.filter((n) => n.tag === "mixed").length, context: base.filter((n) => n.tag === "context").length };
  }, [items, jobyOnly]);
  const shown = filtered.slice(0, limit);
  const groups: { day: string; items: TimelineItem[] }[] = [];
  for (const n of shown) {
    const day = fmtDay(n.publishedAt);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(n);
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {(["all", "catalyst", "risk", "mixed", "context"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTag(t)}
            aria-pressed={tag === t}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${tag === t ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {t} ({counts[t]})
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={jobyOnly} onChange={(e) => setJobyOnly(e.target.checked)} className="h-4 w-4 accent-slate-900 dark:accent-white" />
          Only headlines naming Joby
        </label>
      </div>
      {groups.length === 0 && <p className="text-sm text-slate-500">No headlines match this filter.</p>}
      <ol className="relative space-y-5 border-l border-slate-200 pl-4 dark:border-slate-700">
        {groups.map((g) => (
          <li key={g.day}>
            <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden />
            <time className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.day}</time>
            <ul className="mt-1.5 space-y-2">
              {g.items.map((n) => (
                <li key={n.url} className="flex items-start gap-2">
                  <TagPill tag={n.tag} matched={n.matched} />
                  <div className="min-w-0">
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-900 hover:text-sky-700 hover:underline dark:text-slate-100 dark:hover:text-sky-400">
                      {n.title}
                    </a>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {n.publisher ?? "Unknown publisher"} · via {n.feed} ·{" "}
                      {new Date(n.publishedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}
                      {!n.jobySpecific && " · sector"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + 30)} className="no-print mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
          Show more ({filtered.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
