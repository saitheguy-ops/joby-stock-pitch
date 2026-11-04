import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ValuationModel } from "@/components/ValuationModel";
import { ValuationSummary } from "@/components/summaries";
import { Badge, Card, Collapsible, InfoTip, PageHeader, Skeleton, SourceLink, Unavailable } from "@/components/ui";
import { TICKER } from "@/lib/config";
import { getComps } from "@/lib/comps";
import { fmtDate, fmtMoney, fmtMoneyM, fmtPrice } from "@/lib/format";
import { defaultScenarios } from "@/lib/model";
import { getModelData } from "@/lib/joby";
import { safe, yahooQuoteUrl } from "@/lib/sources";
import { getProfile } from "@/lib/yahoo";

export const metadata: Metadata = { title: "Valuation" };

export default function ValuationPage() {
  return (
    <>
      <PageHeader
        title="Valuation"
        intro="Joby has almost no revenue yet, so a P/E or EV/Sales multiple tells you little. Instead this page values it with a scenario DCF: project what the business could earn once certified, subtract the cash it must burn to get there, discount back to today, and weight bear/base/bull outcomes by probability. Comps show how the market prices other listed eVTOL companies."
      >
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Plain-language walkthrough: <a className="underline" href="https://github.com/saitheguy-ops/joby-stock-pitch/blob/main/docs/VALUATION.md" target="_blank" rel="noopener noreferrer">docs/VALUATION.md</a>
        </p>
      </PageHeader>
      <Suspense fallback={<Skeleton className="mb-6 h-24" />}>
        <ValuationSummary />
      </Suspense>
      <div className="space-y-6">
        <Suspense fallback={<Skeleton className="h-[70vh]" />}>
          <ModelSection />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-72" />}>
          <CompsSection />
        </Suspense>
      </div>
    </>
  );
}

async function ModelSection() {
  await connection();
  const [res, prof] = await Promise.all([getModelData(), safe(() => getProfile(TICKER))]);
  if (!res.ok) return <Unavailable what="Live model inputs (SEC EDGAR / Yahoo)" error={res.error} />;
  const d = res.data;
  const c = d.company;
  const inputs = [
    { label: "Share price", value: fmtPrice(c.currentPrice), src: d.sources.price, tip: "What one share costs today; the model's output is compared with it." },
    { label: "Cash & short-term investments", value: fmtMoneyM(c.cashAndInvestmentsM), src: d.sources.cash, tip: "Added to enterprise value: cash already in the bank belongs to shareholders." },
    { label: "Debt", value: fmtMoneyM(c.debtM), src: d.sources.debt, tip: "Subtracted: lenders (mainly the 2032 convertible notes) are paid before shareholders. Treated as debt, not shares: the notes convert into roughly 48.6M shares (≈$14.20 per share, per the 2026 10-Q note disclosures), far above today's price." },
    { label: "Shares outstanding", value: `${c.sharesM.toFixed(1)}M`, src: d.sources.shares, tip: "Equity value is divided by this (after the future-dilution assumption)." },
    { label: "Trailing 4-quarter FCF burn", value: fmtMoneyM(d.annualBurnM), src: d.sources.burn, tip: "Default for 'annual burn before launch' in every scenario." },
    {
      label: `Burn before ${c.firstForecastYear} (stub)`,
      value: fmtMoneyM(c.stubBurnM),
      src: d.sources.latestBurn,
      tip: `Cash expected to be used between the balance-sheet date (${d.balanceSheetDate}) and the start of the forecast: remaining quarters × latest quarterly burn (${fmtMoneyM(d.latestQuarterlyBurnM)}).`,
    },
  ];
  return (
    <>
      <Collapsible title="Live inputs (sourced)" hint={`Price, cash, debt, shares and burn from filings and the market. The forecast starts in ${c.firstForecastYear}.`}>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inputs.map((i) => (
            <div key={i.label} className="min-w-0 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <dt className="text-xs text-slate-500 dark:text-slate-400">
                {i.label}
                <InfoTip text={i.tip} />
              </dt>
              <dd className="tabular text-lg font-semibold text-slate-900 dark:text-white">{i.value}</dd>
              <dd>
                <SourceLink source={i.src} />
              </dd>
            </div>
          ))}
        </dl>
      </Collapsible>
      <ValuationModel company={c} defaults={defaultScenarios(d.annualBurnM)} />
      <Card title="Street context" subtitle="For comparison only; not an input to the model.">
        {prof.ok && prof.data.analystTargetMean !== null ? (
          <div className="text-sm text-slate-700 dark:text-slate-300">
            <p className="tabular">
              {prof.data.analystCount ?? "Several"} analysts covering JOBY have a mean 12-month price target of <strong>{fmtPrice(prof.data.analystTargetMean)}</strong> (low{" "}
              {fmtPrice(prof.data.analystTargetLow)}, high {fmtPrice(prof.data.analystTargetHigh)}). Sell-side targets usually assume certification on schedule and a lower discount rate than this model&apos;s
              base case. If yours differs a lot, find which assumption explains the gap.
            </p>
            <SourceLink className="mt-1" source={{ label: `Yahoo Finance analyst price targets · fetched ${fmtDate(prof.data.fetchedAt, true)}`, url: `${yahooQuoteUrl(TICKER)}analysis/`, asOf: prof.data.fetchedAt }} />
          </div>
        ) : (
          <Unavailable what="Analyst price targets" error={prof.ok ? "Not reported" : prof.error} />
        )}
      </Card>
    </>
  );
}

async function CompsSection() {
  await connection();
  const res = await safe(() => getComps());
  if (!res.ok) return <Unavailable what="Comparable companies" error={res.error} />;
  const rows = res.data.rows;
  return (
    <Collapsible title="Comps: listed eVTOL / advanced air mobility companies" hint="Market cap, cash, debt, EV and burn for Joby and peers, in USD">
    <Card
      title="Comps: listed eVTOL / advanced air mobility companies"
      subtitle="All values in USD (converted at Yahoo FX rates where companies report in other currencies). EV = market cap + debt − cash. Burn = −(trailing-12-month operating cash flow)."
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="tabular w-full min-w-[820px] text-sm">
          <caption className="sr-only">Comparable companies</caption>
          <thead>
            <tr className="border-b border-slate-200 text-right text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 text-left font-medium">Company</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Market cap</th>
              <th className="py-2 font-medium">Cash</th>
              <th className="py-2 font-medium">Debt</th>
              <th className="py-2 font-medium">
                EV<InfoTip text="Enterprise value: what the market pays for the operating business after netting out cash and debt. For pre-revenue companies it is the market's price for the technology and the option on future success." />
              </th>
              <th className="py-2 font-medium">TTM op. burn</th>
              <th className="py-2 font-medium">
                Cash / burn<InfoTip text="Years of cash at the trailing-twelve-month operating burn rate (excludes capex, so it flatters companies that spend heavily on facilities)." />
              </th>
              <th className="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className={`border-b border-slate-100 align-top dark:border-slate-800 ${r.isSubject ? "bg-sky-50/60 dark:bg-sky-950/30" : ""}`}>
                <td className="py-2 pr-2 text-left">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {r.ticker} <span className="font-normal text-slate-600 dark:text-slate-300">{r.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{r.note}</div>
                  <div className="mt-0.5">
                    {r.listed ? <Badge tone="good">✓ Listed</Badge> : <Badge tone="warn">⚠ Unverified</Badge>}{" "}
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{r.listingNote}</span>
                  </div>
                </td>
                <td className="py-2 text-right">{fmtPrice(r.price)}</td>
                <td className="py-2 text-right">{fmtMoney(r.marketCapUsd)}</td>
                <td className="py-2 text-right">{fmtMoney(r.cashUsd)}</td>
                <td className="py-2 text-right">{fmtMoney(r.debtUsd)}</td>
                <td className="py-2 text-right font-semibold">{fmtMoney(r.evUsd)}</td>
                <td className="py-2 text-right">
                  {r.burnUsd === null ? <span title="Not reported by Yahoo or EDGAR quarterly XBRL">n/a</span> : r.burnUsd < 0 ? `+${fmtMoney(-r.burnUsd)} (gen.)` : fmtMoney(r.burnUsd)}
                  {r.burnSource === "SEC EDGAR" && <div className="text-[10px] text-slate-500">via EDGAR</div>}
                </td>
                <td className="py-2 text-right">{r.cashYears === null ? "n/a" : `${r.cashYears.toFixed(1)} yrs`}</td>
                <td className="py-2 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    {r.sources.map((s) => (
                      <SourceLink key={s.url + s.label} source={s} compact />
                    ))}
                    {r.financialCurrency && r.financialCurrency !== "USD" && <span className="text-[10px] text-slate-500">reports in {r.financialCurrency}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p>
          How to read it: with little revenue, the useful comparisons are <strong>EV</strong> (how much value the market assigns beyond cash) and <strong>cash vs. burn</strong> (how long each company can
          fund itself). A large EV relative to peers means investors are paying for leadership in certification and scale.
        </p>
        <p>
          Caveats: Yahoo&apos;s &quot;total debt&quot; can include lease liabilities and differ from the balance-sheet debt used in the DCF. Market caps for ADRs (e.g. EH) depend on Yahoo&apos;s share-count
          basis. Listing status is checked live: only companies with a trade in the last 10 days on a major US exchange are marked listed. Fetched {fmtDate(res.data.fetchedAt, true)}.
        </p>
      </div>
    </Card>
    </Collapsible>
  );
}
