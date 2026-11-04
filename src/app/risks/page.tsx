import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TagPill } from "@/components/NewsTimeline";
import { Card, PageHeader, Skeleton, SourceLink, Unavailable } from "@/components/ui";
import { JOBY_CIK } from "@/lib/config";
import { getFinancials } from "@/lib/edgar";
import { getLatestPeriodicHighlights, getRiskFactors } from "@/lib/filings";
import { fmtDate, fmtMoney, fmtPct, fmtShares } from "@/lib/format";
import { computeKeyMetrics } from "@/lib/joby";
import { getNews } from "@/lib/news";
import { matchBullets, matchHeadlines, RISK_THEMES, type ThemeId } from "@/lib/risk-themes";
import { edgarBrowseUrl, safe, type Source } from "@/lib/sources";

export const metadata: Metadata = { title: "Risks" };

export default function RisksPage() {
  return (
    <>
      <PageHeader
        title="Risks & concerns"
        intro="The key risks to the investment case, grouped into themes. Each theme quotes the matching items from the Risk Factors Summary in Joby's latest 10-K (pulled live from SEC EDGAR), adds a hard data point where one exists, and lists recent headlines that touch it."
      />
      <Suspense fallback={<Skeleton className="h-[70vh]" />}>
        <RisksBody />
      </Suspense>
    </>
  );
}

async function RisksBody() {
  await connection();
  const [rf, hl, fin, news] = await Promise.all([safe(() => getRiskFactors()), safe(() => getLatestPeriodicHighlights()), safe(() => getFinancials()), safe(() => getNews())]);
  const bullets = rf.ok ? rf.data.groups.flatMap((g) => g.bullets) : [];
  const tenKSource: Source | null = rf.ok ? { label: `SEC 10-K (FY ending ${rf.data.filing.reportDate}, filed ${rf.data.filing.filed}) · Item 1A Risk Factors`, url: rf.data.filing.url, asOf: rf.data.filing.filed } : null;
  const qSource: Source | null = hl.ok ? { label: `SEC ${hl.data.filing.form} for period ending ${hl.data.filing.reportDate} (filed ${hl.data.filing.filed})`, url: hl.data.filing.url, asOf: hl.data.filing.filed } : null;
  const m = fin.ok ? computeKeyMetrics(fin.data) : null;
  const jobyNews = news.ok ? news.data.items.filter((n) => n.jobySpecific) : [];

  /** Hard evidence per theme, built only from live sourced data. */
  const evidence: Partial<Record<ThemeId, { text: string; source: Source }[]>> = {};
  if (hl.ok && qSource) {
    evidence.regulatory = hl.data.certification.filter((s) => /stage|eIPP|Dubai|GCAA/.test(s)).slice(0, 2).map((text) => ({ text: `“${text}”`, source: qSource }));
    evidence.legal = hl.data.legal.map((text) => ({ text: `“${text}”`, source: qSource }));
    evidence.cash = hl.data.liquidity.slice(0, 1).map((text) => ({ text: `“${text}”`, source: qSource }));
  }
  if (m) {
    const cash = evidence.cash ?? [];
    if (m.cashAndInvestments && m.quarterlyBurn && m.runwayQuartersLatest !== null)
      cash.unshift({
        text: `${fmtMoney(m.cashAndInvestments.value)} of cash & investments vs. ${fmtMoney(m.quarterlyBurn.value)} burned last quarter: about ${m.runwayQuartersLatest.toFixed(1)} quarters of runway (to ~${fmtDate(m.runwayEndLatest)}) if burn stays flat.`,
        source: m.quarterlyBurn.source,
      });
    if (m.dilution && m.dilutionSource)
      cash.push({
        text: `Shares outstanding rose ${fmtPct(m.dilution.totalPct, 0, true)} from ${fmtShares(m.dilution.first.shares)} (${m.dilution.first.date}) to ${fmtShares(m.dilution.last.shares)} (${m.dilution.last.date}), about ${fmtPct(m.dilution.annualPct, 1)} a year.`,
        source: m.dilutionSource,
      });
    evidence.cash = cash;
  }

  return (
    <div className="space-y-6">
      {!rf.ok && <Unavailable what="10-K Risk Factors" error={rf.error} source={{ label: "Joby filings on EDGAR", url: edgarBrowseUrl(JOBY_CIK) }} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {RISK_THEMES.map((t, idx) => {
          const tb = matchBullets(t, bullets);
          const th = matchHeadlines(t, jobyNews);
          const ev = evidence[t.id] ?? [];
          return (
            <Card key={t.id} title={`${idx + 1}. ${t.title}`}>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.summary}</p>
              {ev.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Evidence</h3>
                  <ul className="mt-1 space-y-1.5">
                    {ev.map((e) => (
                      <li key={e.text} className="text-sm text-slate-800 dark:text-slate-200">
                        {e.text} <SourceLink source={e.source} compact />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tb.length > 0 && tenKSource && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">What the 10-K says</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                    {tb.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <SourceLink className="mt-1" source={tenKSource} />
                </div>
              )}
              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent headlines</h3>
                {th.length ? (
                  <ul className="mt-1 space-y-1.5">
                    {th.map((n) => (
                      <li key={n.url} className="flex items-start gap-2 text-sm">
                        <TagPill tag={n.tag} matched={n.matched} />
                        <span className="min-w-0">
                          <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-slate-900 hover:underline dark:text-slate-100">
                            {n.title}
                          </a>{" "}
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {n.publisher} · {fmtDate(n.publishedAt)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{news.ok ? "No matching headlines in the current feeds." : "News feeds unavailable."}</p>
                )}
              </div>
              <p className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <strong>Watch:</strong> {t.watch}
              </p>
              <p className="mt-1 text-[10px] text-slate-400" title={`Filing match: ${t.filingRe.source}\nNews match: ${t.newsRe.source}`}>
                Matching rules: hover to see
              </p>
            </Card>
          );
        })}
      </div>

      {rf.ok && tenKSource && (
        <Card title="Full Risk Factors Summary (latest 10-K)" subtitle="Every bullet, grouped as in the filing. The full Item 1A section runs to dozens of pages and is worth skimming before an interview.">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-sky-700 dark:text-sky-400">Show all {bullets.length} risk factors</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {rf.data.groups.map((g) => (
                <div key={g.heading}>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{g.heading}</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700 dark:text-slate-300">
                    {g.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
          <SourceLink className="mt-3" source={tenKSource} />
        </Card>
      )}
    </div>
  );
}
