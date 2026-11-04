import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { NewsTimeline } from "@/components/NewsTimeline";
import { Badge, Card, PageHeader, Skeleton, SourceLink, Unavailable } from "@/components/ui";
import { getUpcomingCatalysts } from "@/lib/catalysts";
import { JOBY_CIK } from "@/lib/config";
import { EIGHT_K_ITEMS } from "@/lib/edgar";
import { getRecentMaterialFilings } from "@/lib/filings";
import { fmtDate } from "@/lib/format";
import { getNews } from "@/lib/news";
import { edgarBrowseUrl, safe } from "@/lib/sources";

export const metadata: Metadata = { title: "News & Catalysts" };

export default function NewsPage() {
  return (
    <>
      <PageHeader
        title="News & catalysts"
        intro="Recent headlines from Yahoo Finance and Google News, merged and de-duplicated, plus Joby's own SEC filings. Each headline is auto-tagged as a catalyst or a risk using visible keyword rules (hover a tag to see why). Treat the tags as a first pass, not a judgment."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<Skeleton className="h-[60vh]" />}>
            <Timeline />
          </Suspense>
        </div>
        <div className="space-y-6">
          <Suspense fallback={<Skeleton className="h-80" />}>
            <Upcoming />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-80" />}>
            <Filings />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Timeline() {
  await connection();
  const res = await safe(() => getNews());
  if (!res.ok) return <Unavailable what="News feeds" error={res.error} />;
  const { items, feeds, fetchedAt } = res.data;
  return (
    <Card title="Timeline" subtitle={`Newest first · fetched ${fmtDate(fetchedAt, true)}`}>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {feeds.map((f) => (
          <a key={f.name} href={f.url} target="_blank" rel="noopener noreferrer" title={f.error} className="inline-flex items-center gap-1 underline decoration-dotted">
            <Badge tone={f.ok ? "good" : "warn"}>{f.ok ? "✓" : "⚠"} {f.name}</Badge>
            <span className="text-slate-500 dark:text-slate-400">{f.ok ? `${f.count} items` : "unavailable"}</span>
          </a>
        ))}
      </div>
      {items.length ? <NewsTimeline items={items} /> : <Unavailable what="Headlines" error="Both news feeds failed or returned nothing" />}
    </Card>
  );
}

async function Upcoming() {
  await connection();
  const news = await safe(() => getNews());
  const { items, errors } = await getUpcomingCatalysts(news.ok ? news.data.items : []);
  const label = { earnings: "Earnings", filing: "From filing", news: "From news" } as const;
  const tone = { earnings: "info", filing: "neutral", news: "warn" } as const;
  return (
    <Card title="Catalysts to watch" subtitle="Scheduled events, dated targets stated in the latest 10-Q/10-K, and forward-looking headlines from the last 45 days.">
      {items.length === 0 && <Unavailable what="Upcoming catalysts" error={errors.join("; ")} />}
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.title} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone[c.kind]}>{label[c.kind]}</Badge>
              <span className="tabular text-xs font-semibold text-slate-700 dark:text-slate-300">{c.when}</span>
            </div>
            <p className="mt-1 text-slate-800 dark:text-slate-200">{c.title}</p>
            <SourceLink source={c.source} />
          </li>
        ))}
      </ul>
      {errors.length > 0 && items.length > 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Partially unavailable: {errors.join("; ")}</p>}
    </Card>
  );
}

async function Filings() {
  await connection();
  const res = await safe(() => getRecentMaterialFilings());
  if (!res.ok) return <Unavailable what="SEC filing list" error={res.error} source={{ label: "Joby on EDGAR", url: edgarBrowseUrl(JOBY_CIK) }} />;
  return (
    <Card title="Recent SEC filings" subtitle="Primary source for material events. 8-K item numbers are decoded.">
      <ul className="space-y-2 text-sm">
        {res.data.map((f) => (
          <li key={f.url} className="flex gap-2">
            <span className="tabular w-20 shrink-0 text-xs text-slate-500 dark:text-slate-400">{f.filed}</span>
            <div className="min-w-0">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 hover:text-sky-700 hover:underline dark:text-slate-100 dark:hover:text-sky-400">
                {f.form}
              </a>
              {f.items && (
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {" "}
                  ·{" "}
                  {f.items
                    .split(",")
                    .filter((i) => i && i !== "9.01")
                    .map((i) => EIGHT_K_ITEMS[i] ?? `Item ${i}`)
                    .join(", ")}
                </span>
              )}
              {f.form === "424B5" && <span className="text-xs text-slate-600 dark:text-slate-400"> · Prospectus supplement (securities offering)</span>}
            </div>
          </li>
        ))}
      </ul>
      <SourceLink className="mt-3" source={{ label: "All Joby filings on SEC EDGAR", url: edgarBrowseUrl(JOBY_CIK), asOf: new Date().toISOString() }} />
    </Card>
  );
}
