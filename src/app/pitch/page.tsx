import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrintButton } from "@/components/PrintButton";
import { Badge, Card, Skeleton, SourceLink, Unavailable } from "@/components/ui";
import { getFinancials } from "@/lib/edgar";
import { fmtDate, fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { computeKeyMetrics } from "@/lib/joby";
import { runDefaultModel } from "@/lib/model";
import { safe } from "@/lib/sources";

export const metadata: Metadata = { title: "The Pitch" };

const PITCH_FILE = path.join(process.cwd(), "content", "pitch.md");

export default function PitchPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          One-page pitch. The text comes from <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">content/pitch.md</code>: edit that file to rewrite it in your own words.
        </p>
        <PrintButton />
      </div>
      <Suspense fallback={<Skeleton className="h-28" />}>
        <LivePanel />
      </Suspense>
      <Suspense fallback={<Skeleton className="mt-6 h-[60vh]" />}>
        <PitchText />
      </Suspense>
    </article>
  );
}

/** Live numbers from the default model, so a stale draft is easy to spot. */
async function LivePanel() {
  await connection();
  const [model, fin] = await Promise.all([runDefaultModel(), safe(() => getFinancials())]);
  if (!model.ok) return <Unavailable what="Live model check" error={model.error} />;
  const m = model.data;
  const km = fin.ok ? computeKeyMetrics(fin.data) : null;
  const tone = m.recommendation === "BUY" ? "good" : m.recommendation === "SELL" ? "bad" : "neutral";
  return (
    <Card className="mb-6" title={<span className="flex flex-wrap items-center gap-2">Live check <Badge tone={tone}>Model says {m.recommendation}</Badge></span>} subtitle={`Default assumptions on today's data · ${fmtDate(m.data.quote.marketTime ?? m.data.quote.fetchedAt, true)}`}>
      <dl className="tabular grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Price</dt>
          <dd className="text-lg font-semibold">{fmtPrice(m.data.company.currentPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Prob.-weighted target</dt>
          <dd className="text-lg font-semibold">
            {fmtPrice(m.weighted.target)} <span className="text-xs font-normal">({fmtPct(m.weighted.upside, 0, true)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Bear / Base / Bull</dt>
          <dd className="font-semibold">
            {fmtPrice(m.prices.bear)} / {fmtPrice(m.prices.base)} / {fmtPrice(m.prices.bull)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Runway (pro forma)</dt>
          <dd className="font-semibold">
            {km?.runwayQuartersLatest != null ? `${km.runwayQuartersLatest.toFixed(1)} qtrs` : "n/a"}
            {km?.proFormaRunwayQuarters != null && ` (${km.proFormaRunwayQuarters.toFixed(1)})`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Reverse DCF: today&apos;s price implies ~{m.impliedFleet ? Math.round(m.impliedFleet).toLocaleString("en-US") : "n/a"} aircraft at scale (base case: {m.scenarios[1].fleetAtScale.toLocaleString("en-US")}). Biggest base-case drivers:{" "}
        {m.topDrivers.map((d) => d.label.toLowerCase()).join(", ")}. Cash {fmtMoney(m.data.company.cashAndInvestmentsM * 1e6)} as of {m.data.balanceSheetDate}.
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4">
        <SourceLink source={m.data.sources.price} />
        <SourceLink source={m.data.sources.cash} />
      </div>
    </Card>
  );
}

async function PitchText() {
  await connection();
  const md = await safe(() => readFile(PITCH_FILE, "utf8"));
  if (!md.ok) return <Unavailable what="content/pitch.md" error={md.error} />;
  return (
    <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h1:text-2xl prose-h2:mt-6 prose-h2:text-lg prose-a:text-sky-700 prose-blockquote:not-italic prose-blockquote:border-amber-400 prose-blockquote:bg-amber-50 prose-blockquote:py-1 prose-table:text-sm dark:prose-invert dark:prose-a:text-sky-400 dark:prose-blockquote:bg-amber-950/40 print:prose-sm">
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("/") ? (
              <a href={href}>{children}</a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {md.data}
      </ReactMarkdown>
    </div>
  );
}
