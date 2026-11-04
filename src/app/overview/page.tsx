import { connection } from "next/server";
import { Suspense } from "react";
import { PriceChart } from "@/components/charts";
import { OverviewSummary } from "@/components/summaries";
import { Card, Collapsible, InfoTip, PageHeader, Skeleton, SourceLink, Stat, Unavailable } from "@/components/ui";
import { JOBY_CIK, TICKER } from "@/lib/config";
import { getFinancials } from "@/lib/edgar";
import { getLatestPeriodicHighlights } from "@/lib/filings";
import { fmtDate, fmtMoney, fmtPct, fmtPrice, fmtShares } from "@/lib/format";
import { computeKeyMetrics, yahooSource } from "@/lib/joby";
import { edgarBrowseUrl, safe, yahooQuoteUrl } from "@/lib/sources";
import { getHistory, getProfile, getQuote, type RangeKey } from "@/lib/yahoo";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Joby Aviation (NYSE: JOBY)"
        intro="Joby is developing an all-electric air taxi that takes off and lands vertically (eVTOL). It is still pre-certification: revenue today is small, so the investment case rests on getting FAA type certification, scaling production, and funding the cash burn until then."
      />
      <Suspense fallback={<Skeleton className="mb-6 h-24" />}>
        <OverviewSummary />
      </Suspense>
      <div className="space-y-6">
        <Suspense fallback={<Skeleton className="h-28" />}>
          <QuoteStats />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-80" />}>
          <PriceSection />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <Snapshot />
        </Suspense>
      </div>
    </>
  );
}

async function QuoteStats() {
  await connection();
  const [q, fin] = await Promise.all([safe(() => getQuote(TICKER)), safe(() => getFinancials())]);
  const m = fin.ok ? computeKeyMetrics(fin.data) : null;
  if (!q.ok && !m) return <Unavailable what="Quote and financial data" error={q.ok ? undefined : q.error} />;
  const quote = q.ok ? q.data : null;
  const src = quote ? yahooSource(quote) : null;
  const lo = quote?.fiftyTwoWeekLow ?? null;
  const hi = quote?.fiftyTwoWeekHigh ?? null;
  const pos = quote?.price !== null && quote?.price !== undefined && lo !== null && hi !== null && hi > lo ? (quote.price - lo) / (hi - lo) : null;
  return (
    <div className="space-y-3">
      {quote ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="tabular text-4xl font-bold text-slate-900 dark:text-white">{fmtPrice(quote.price)}</span>
          {quote.change !== null && quote.changePct !== null && (
            <span className={`tabular text-lg font-semibold ${quote.change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {quote.change >= 0 ? "+" : "−"}
              {Math.abs(quote.change).toFixed(2)} ({fmtPct(quote.changePct / 100, 2, true)})
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {quote.exchange} · {quote.currency} · {quote.marketState === "REGULAR" ? "market open, " : ""}last trade {fmtDate(quote.marketTime, true)} · <SourceLink source={src!} compact />
          </span>
        </div>
      ) : (
        <Unavailable what="Live quote" error={!q.ok ? q.error : undefined} source={{ label: "JOBY on Yahoo Finance", url: yahooQuoteUrl(TICKER) }} />
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={<>Market cap<InfoTip text="Share price × shares outstanding, as reported by Yahoo Finance. What the market values the whole company's equity at today." /></>} value={fmtMoney(quote?.marketCap)} source={src} />
        <Stat
          label={<>Shares outstanding<InfoTip text="From the cover page of Joby's latest SEC filing. Yahoo's figure may be more recent; both are shown when available." /></>}
          value={fmtShares(m?.sharesOutstanding?.value)}
          sub={quote?.sharesOutstanding ? `Yahoo: ${fmtShares(quote.sharesOutstanding)}` : undefined}
          source={m?.sharesOutstanding?.source}
        />
        <Stat
          label="52-week range"
          value={lo !== null && hi !== null ? `${fmtPrice(lo)} – ${fmtPrice(hi)}` : "n/a"}
          sub={
            pos !== null ? (
              <span className="mt-1 block">
                <span className="relative block h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" aria-label={`Price is ${Math.round(pos * 100)}% of the way from the 52-week low to the high`}>
                  <span className="absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-full bg-slate-900 dark:bg-white" style={{ left: `calc(${pos * 100}% - 3px)` }} />
                </span>
              </span>
            ) : undefined
          }
          source={src}
        />
        <Stat label={<>Cash &amp; investments<InfoTip text="Cash, equivalents and short-term investments on the latest balance sheet (SEC 10-Q/10-K)." /></>} value={fmtMoney(m?.cashAndInvestments?.value)} source={m?.cashAndInvestments?.source} />
        <Stat
          label={<>Cash runway<InfoTip text="Cash & investments ÷ latest quarterly free-cash-flow burn. See Financials for the calculation." /></>}
          value={m?.runwayQuartersLatest != null ? `${m.runwayQuartersLatest.toFixed(1)} quarters` : "n/a"}
          sub={m?.quarterlyBurn ? `at ${fmtMoney(m.quarterlyBurn.value)}/qtr burn` : undefined}
          source={m?.quarterlyBurn?.source}
        />
      </div>
    </div>
  );
}

const RANGES: RangeKey[] = ["1M", "1Y", "5Y", "MAX"];

async function PriceSection() {
  await connection();
  const results = await Promise.all(RANGES.map((r) => safe(() => getHistory(TICKER, r))));
  const series = results.flatMap((r) => (r.ok ? [{ range: r.data.range, points: r.data.points }] : []));
  const failed = results.find((r) => !r.ok);
  const firstOk = results.find((r) => r.ok);
  const fetchedAt = firstOk?.ok ? firstOk.data.fetchedAt : null;
  return (
    <Collapsible title="Share price chart" hint="1M / 1Y / 5Y / Max · adjusted close" defaultOpen>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">JOBY began trading in Aug 2021 after merging with a SPAC; earlier prices are the SPAC&apos;s.</p>
      {series.length ? <PriceChart series={series} /> : <Unavailable what="Price history" error={failed && !failed.ok ? failed.error : undefined} source={{ label: "JOBY history on Yahoo Finance", url: `${yahooQuoteUrl(TICKER)}history/` }} />}
      {fetchedAt && <SourceLink className="mt-2" source={{ label: `Yahoo Finance chart data · fetched ${fmtDate(fetchedAt, true)}`, url: `${yahooQuoteUrl(TICKER)}history/`, asOf: fetchedAt }} />}
    </Collapsible>
  );
}

async function Snapshot() {
  await connection();
  const [hl, prof] = await Promise.all([safe(() => getLatestPeriodicHighlights()), safe(() => getProfile(TICKER))]);
  const filingSrc = hl.ok ? { label: `SEC ${hl.data.filing.form} for period ending ${hl.data.filing.reportDate} · filed ${hl.data.filing.filed}`, url: hl.data.filing.url, asOf: hl.data.filing.filed } : null;
  return (
    <Collapsible title="In Joby's own words: business model, certification stage, profile" hint="Quoted from the latest 10-Q/10-K and the Yahoo profile">
      <div className="grid gap-4 lg:grid-cols-2">
      <Card title="What Joby does & how it plans to make money" subtitle="In the company's own words, from its latest periodic filing">
        {hl.ok && hl.data.business.length ? (
          <>
            <FilingQuotes items={hl.data.business} />
            <SourceLink source={filingSrc!} className="mt-3" />
          </>
        ) : (
          <Unavailable what="Filing excerpt" error={!hl.ok ? hl.error : "No matching sentences found"} source={{ label: "Joby filings on EDGAR", url: edgarBrowseUrl(JOBY_CIK) }} />
        )}
      </Card>
      <Card title="Stage: where certification stands" subtitle="Type certification from the FAA is required for widespread commercial service">
        {hl.ok && hl.data.certification.length ? (
          <>
            <FilingQuotes items={hl.data.certification} />
            <SourceLink source={filingSrc!} className="mt-3" />
          </>
        ) : (
          <Unavailable what="Certification status excerpt" error={!hl.ok ? hl.error : "No matching sentences found"} />
        )}
      </Card>
      <Card title="Company profile" className="lg:col-span-2">
        {prof.ok ? (
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            {prof.data.summary && <p className="leading-relaxed">{prof.data.summary}</p>}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Industry</dt>
                <dd>{prof.data.industry ?? "n/a"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Headquarters</dt>
                <dd>{[prof.data.city, prof.data.state].filter(Boolean).join(", ") || "n/a"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Full-time employees</dt>
                <dd className="tabular">{prof.data.employees?.toLocaleString("en-US") ?? "n/a"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Next earnings</dt>
                <dd className="tabular">
                  {prof.data.earningsDates[0] ? `${fmtDate(prof.data.earningsDates[0], true)}${prof.data.earningsIsEstimate ? " (estimate)" : ""}` : "n/a"}
                </dd>
              </div>
            </dl>
            <SourceLink source={{ label: `Yahoo Finance profile & calendar · fetched ${fmtDate(prof.data.fetchedAt, true)}`, url: `${yahooQuoteUrl(TICKER)}profile/`, asOf: prof.data.fetchedAt }} />
          </div>
        ) : (
          <Unavailable what="Company profile" error={prof.error} source={{ label: "JOBY profile on Yahoo Finance", url: `${yahooQuoteUrl(TICKER)}profile/` }} />
        )}
      </Card>
    </div>
    </Collapsible>
  );
}

function FilingQuotes({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s} className="border-l-2 border-slate-300 pl-3 text-sm leading-relaxed text-slate-700 dark:border-slate-600 dark:text-slate-300">
          “{s}”
        </li>
      ))}
    </ul>
  );
}
