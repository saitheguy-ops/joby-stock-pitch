import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarSeries, LineSeries } from "@/components/charts";
import { StatementTable } from "@/components/StatementTable";
import { FinancialsSummary } from "@/components/summaries";
import { Card, Collapsible, InfoTip, PageHeader, Skeleton, SourceLink, Stat, Unavailable } from "@/components/ui";
import { JOBY_CIK } from "@/lib/config";
import { getFinancials } from "@/lib/edgar";
import { lastN } from "@/lib/edgar-parse";
import { fmtDate, fmtMoney, fmtPct, fmtShares, periodLabel } from "@/lib/format";
import { computeKeyMetrics, findItem } from "@/lib/joby";
import { edgarBrowseUrl, edgarCompanyFactsUrl, safe } from "@/lib/sources";
import { buildView } from "@/lib/statement-view";

export const metadata: Metadata = { title: "Financials" };

export default function FinancialsPage() {
  return (
    <>
      <PageHeader
        title="Financials"
        intro="Income statement, balance sheet and cash flow straight from Joby's SEC filings (XBRL data via EDGAR). Click any number to open the filing it came from. Joby is pre-certification, so the numbers that matter most are cash, cash burn and share count."
      />
      <Suspense fallback={<Skeleton className="mb-6 h-24" />}>
        <FinancialsSummary />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-[60vh]" />}>
        <FinancialsBody />
      </Suspense>
    </>
  );
}

async function FinancialsBody() {
  await connection();
  const res = await safe(() => getFinancials());
  if (!res.ok) {
    return <Unavailable what="SEC EDGAR financial data" error={res.error} source={{ label: "Joby filings on EDGAR", url: edgarBrowseUrl(JOBY_CIK) }} />;
  }
  const f = res.data;
  const m = computeKeyMetrics(f);
  const cashInv = findItem(f, "cashinv");
  const cfo = findItem(f, "cfo");
  const sourceAll = { label: `SEC EDGAR companyfacts API · fetched ${fmtDate(f.fetchedAt, true)}`, url: edgarCompanyFactsUrl(JOBY_CIK), asOf: f.fetchedAt };

  const cashData = lastN(cashInv?.quarterly.filter((p) => /-(03-31|06-30|09-30|12-31)$/.test(p.end)) ?? [], 16).map((p) => ({
    label: periodLabel(p.end, false).replace(" 20", " '"),
    value: p.val,
    note: `as of ${p.end} · SEC ${p.form} filed ${p.filed}`,
  }));
  const burnData = lastN(cfo?.quarterly ?? [], 16).map((p) => ({
    label: periodLabel(p.end, false).replace(" 20", " '"),
    value: -p.val,
    note: `${p.start} to ${p.end}${p.derived ? " · derived from YTD" : ""} · SEC ${p.form}`,
  }));
  const shareData = f.coverShares.map((p) => ({ date: p.end, value: p.val, note: `cover page of ${p.form} filed ${p.filed}` }));

  return (
    <div className="space-y-6">
      {/* Runway + dilution headline */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={<>Cash &amp; investments<InfoTip text="Cash, cash equivalents and short-term investments: the money available to fund development before revenue arrives." /></>}
          value={fmtMoney(m.cashAndInvestments?.value)}
          source={m.cashAndInvestments?.source}
        />
        <Stat
          label={<>Latest quarterly burn<InfoTip text="Free-cash-flow burn = −(operating cash flow − capital expenditures) for the most recent quarter. Quarterly cash-flow figures are derived from year-to-date filings." /></>}
          value={fmtMoney(m.quarterlyBurn?.value)}
          sub={m.avgQuarterlyBurnTTM ? `4-quarter average: ${fmtMoney(m.avgQuarterlyBurnTTM.value)}` : undefined}
          source={m.quarterlyBurn?.source}
          tone="bad"
        />
        <Stat
          label={<>Cash runway<InfoTip text="Runway = cash & investments ÷ quarterly burn. It assumes burn stays flat and ignores new financing, so treat it as a 'how long without raising' gauge, not a forecast." /></>}
          value={m.runwayQuartersLatest !== null ? `${m.runwayQuartersLatest.toFixed(1)} qtrs` : "n/a"}
          sub={
            m.runwayQuartersAvg !== null
              ? `≈ to ${fmtDate(m.runwayEndLatest)} at latest burn; ${m.runwayQuartersAvg.toFixed(1)} qtrs (to ${fmtDate(m.runwayEndAvg)}) at 4-qtr avg`
              : undefined
          }
        />
        <Stat
          label={<>Share dilution<InfoTip text="Growth in shares outstanding (cover-page counts). Each new share shrinks existing holders' slice of the company." /></>}
          value={m.dilution ? fmtPct(m.dilution.totalPct, 0, true) : "n/a"}
          sub={m.dilution ? `${fmtShares(m.dilution.first.shares)} (${m.dilution.first.date}) → ${fmtShares(m.dilution.last.shares)} (${m.dilution.last.date}); ${fmtPct(m.dilution.annualPct, 1)}/yr` : undefined}
          source={m.dilutionSource}
          tone="bad"
        />
      </div>

      <Collapsible title="How runway is calculated" hint="The arithmetic, pro-forma adjustments and caveats">
        {m.cashAndInvestments && m.quarterlyBurn && m.runwayQuartersLatest !== null ? (
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p className="tabular">
              Runway = {fmtMoney(m.cashAndInvestments.value)} ÷ {fmtMoney(m.quarterlyBurn.value)} per quarter ={" "}
              <strong>{m.runwayQuartersLatest.toFixed(1)} quarters</strong> (≈ {(m.runwayQuartersLatest / 4).toFixed(1)} years from {fmtDate(m.balanceSheetDate)}).
            </p>
            {m.avgQuarterlyBurnTTM && m.runwayQuartersAvg !== null && (
              <p className="tabular">
                Using the trailing four-quarter average burn of {fmtMoney(m.avgQuarterlyBurnTTM.value)}: {m.runwayQuartersAvg.toFixed(1)} quarters.
              </p>
            )}
            {m.adjustments.length > 0 && m.proFormaCash !== null && m.proFormaRunwayQuarters !== null && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="tabular">
                  <strong>Pro forma for announced deals:</strong> {fmtMoney(m.cashAndInvestments.value)}{" "}
                  {m.adjustments.map((a) => `${a.cashImpact < 0 ? "−" : "+"} ${fmtMoney(Math.abs(a.cashImpact))} (${a.label})`).join(" ")} = {fmtMoney(m.proFormaCash)}, or{" "}
                  <strong>{m.proFormaRunwayQuarters.toFixed(1)} quarters</strong> at the latest burn (to ~{fmtDate(m.proFormaRunwayEnd)}).
                </p>
                {m.adjustments.map((a) => (
                  <p key={a.id} className="mt-1">
                    {a.explanation} <SourceLink source={a.source} />
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Caveats: burn has been rising as Joby builds manufacturing and prepares for launch, so a flat-burn runway is optimistic. It also excludes undrawn financing (Joby set up a $750M at-the-market stock program in Aug 2026, per its 8-K) and debt maturities (the 2032 convertible notes).
            </p>
            <div className="flex flex-wrap gap-x-4">
              <SourceLink source={m.cashAndInvestments.source} />
              <SourceLink source={m.quarterlyBurn.source} />
            </div>
          </div>
        ) : (
          <Unavailable what="Runway inputs" />
        )}
      </Collapsible>

      <Collapsible title="Charts: cash, operating burn, share count" hint="Last 16 quarters from SEC filings">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cash & short-term investments" subtitle="End of each quarter">
          {cashData.length ? <BarSeries data={cashData} kind="money" ariaLabel="Cash and short-term investments by quarter" /> : <Unavailable what="Cash history" />}
          <SourceLink source={sourceAll} className="mt-2" />
        </Card>
        <Card title="Operating cash burn" subtitle="−(net cash from operations), per quarter">
          {burnData.length ? <BarSeries data={burnData} kind="money" ariaLabel="Operating cash burn by quarter" /> : <Unavailable what="Cash-flow history" />}
          <SourceLink source={sourceAll} className="mt-2" />
        </Card>
        <Card title="Shares outstanding" subtitle="Cover page of each 10-Q / 10-K">
          {shareData.length > 1 ? <LineSeries data={shareData} kind="shares" ariaLabel="Shares outstanding over time" /> : <Unavailable what="Share count history" />}
          {m.dilutionSource && <SourceLink source={m.dilutionSource} className="mt-2" />}
        </Card>
      </div>
      </Collapsible>

      {m.dilution && (
        <Collapsible title="Dilution over time" hint="Share count on every filing cover page">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Shares outstanding grew from <strong>{fmtShares(m.dilution.first.shares)}</strong> ({fmtDate(m.dilution.first.date)}) to{" "}
            <strong>{fmtShares(m.dilution.last.shares)}</strong> ({fmtDate(m.dilution.last.date)}), a <strong>{fmtPct(m.dilution.totalPct, 1, true)}</strong> increase or{" "}
            {fmtPct(m.dilution.annualPct, 1)} per year. Someone who owned 1.00% of Joby at the start owns about{" "}
            <strong>{(m.dilution.ownershipRetained * 100).toFixed(2)}%</strong> today without selling a share. The latest 10-Q&apos;s financing section lists the
            sources: underwritten and at-the-market stock sales, the Toyota private placement, warrant exercises and employee equity plans.
          </p>
          <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="tabular w-full min-w-[420px] text-sm">
              <caption className="sr-only">Shares outstanding by cover-page date</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 text-right font-medium">Shares</th>
                  <th className="py-1.5 text-right font-medium">vs. first</th>
                  <th className="py-1.5 text-right font-medium">Filing</th>
                </tr>
              </thead>
              <tbody>
                {f.coverShares
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((p) => (
                    <tr key={p.end} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1">{p.end}</td>
                      <td className="py-1 text-right">{fmtShares(p.val)}</td>
                      <td className="py-1 text-right">{fmtPct(p.val / m.dilution!.first.shares - 1, 1, true)}</td>
                      <td className="py-1 text-right">
                        <a className="text-sky-700 underline decoration-dotted dark:text-sky-400" href={`https://www.sec.gov/Archives/edgar/data/${Number(JOBY_CIK)}/${p.accn.replace(/-/g, "")}/${p.accn}-index.htm`} target="_blank" rel="noopener noreferrer">
                          {p.form} {p.filed}
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}

      <Collapsible title="Income statement" hint="Annual and quarterly · fiscal years end Dec 31">
        <StatementTable caption="Income statement" annual={buildView(f.income, "annual", 5)} quarterly={buildView(f.income, "quarterly", 6)} unitNote="$ millions, except per-share; (x) = negative" />
      </Collapsible>
      <Collapsible title="Balance sheet" hint="Annual and quarterly">
        <StatementTable caption="Balance sheet" annual={buildView(f.balance, "annual", 5)} quarterly={buildView(f.balance, "quarterly", 6)} unitNote="$ millions; shares in millions" />
      </Collapsible>
      <Collapsible title="Cash flow statement" hint={<>Quarter values marked <sup>d</sup> are derived: 10-Qs report cash flow year-to-date, so Q2 = H1 − Q1, Q4 = FY − 9M.</>}>
        <StatementTable caption="Cash flow statement" annual={buildView(f.cashflow, "annual", 5)} quarterly={buildView(f.cashflow, "quarterly", 6)} unitNote="$ millions; (x) = outflow" />
      </Collapsible>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Hover a row label to see the XBRL concept; hover or click a value to open the filing. Data: <SourceLink source={sourceAll} />.
      </p>
    </div>
  );
}
