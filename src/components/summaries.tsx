import { connection } from "next/server";
import { KeySummary, SourceLink, Unavailable } from "./ui";
import { TICKER } from "@/lib/config";
import { getFinancials } from "@/lib/edgar";
import { getLatestPeriodicHighlights } from "@/lib/filings";
import { fmtDate, fmtMoney, fmtPct, fmtPrice, fmtShares, msAgo } from "@/lib/format";
import {
  computeKeyMetrics,
  findItem,
  latestPoint,
  yahooSource,
} from "@/lib/joby";
import { runDefaultModel } from "@/lib/model";
import { getNews } from "@/lib/news";
import { safe } from "@/lib/sources";
import { getProfile, getQuote } from "@/lib/yahoo";

/*
 * Three-line, live, sourced takeaways shown at the top of each Details page.
 * Each line shows what it can; a missing source yields "n/a", never a guess.
 */

const certificationLine = (statements: string[]) =>
  statements.find(
    (s) =>
      /approximately \d+% complete|five stages/i.test(s) && /complete/i.test(s),
  ) ?? null;

export async function OverviewSummary() {
  await connection();
  const [q, fin, hl] = await Promise.all([
    safe(() => getQuote(TICKER)),
    safe(() => getFinancials()),
    safe(() => getLatestPeriodicHighlights()),
  ]);
  if (!q.ok && !fin.ok)
    return <Unavailable what="Summary" error={q.ok ? undefined : q.error} />;
  const m = fin.ok ? computeKeyMetrics(fin.data) : null;
  const quote = q.ok ? q.data : null;
  const cert = hl.ok ? certificationLine(hl.data.certification) : null;
  return (
    <KeySummary
      lines={[
        <>
          {fmtPrice(quote?.price)} a share, {fmtMoney(quote?.marketCap)} market
          cap; 52-week range {fmtPrice(quote?.fiftyTwoWeekLow)}–
          {fmtPrice(quote?.fiftyTwoWeekHigh)}.{" "}
          {quote && <SourceLink source={yahooSource(quote)} compact />}
        </>,
        cert && hl.ok ? (
          <>
            Certification, in the latest {hl.data.filing.form}: “{cert}”{" "}
            <SourceLink
              source={{
                label: `SEC ${hl.data.filing.form}`,
                url: hl.data.filing.url,
                asOf: hl.data.filing.filed,
              }}
              compact
            />
          </>
        ) : (
          <>Certification status: unavailable from the latest filing.</>
        ),
        <>
          {fmtMoney(m?.cashAndInvestments?.value)} of cash and short-term
          investments vs. {fmtMoney(m?.quarterlyBurn?.value)} burned last
          quarter: about{" "}
          {m?.runwayQuartersLatest != null
            ? m.runwayQuartersLatest.toFixed(1)
            : "n/a"}{" "}
          quarters of runway.{" "}
          {m?.quarterlyBurn && (
            <SourceLink source={m.quarterlyBurn.source} compact />
          )}
        </>,
      ]}
    />
  );
}

export async function FinancialsSummary() {
  await connection();
  const fin = await safe(() => getFinancials());
  if (!fin.ok) return <Unavailable what="Summary" error={fin.error} />;
  const m = computeKeyMetrics(fin.data);
  const rev = latestPoint(findItem(fin.data, "revenue"));
  const ni = latestPoint(findItem(fin.data, "netinc"));
  return (
    <KeySummary
      lines={[
        <>
          Latest quarter ({rev ? `to ${fmtDate(rev.end)}` : "n/a"}): revenue{" "}
          {fmtMoney(rev?.val)}, net loss {fmtMoney(ni?.val)}. Joby is still
          pre-certification, so cash matters more than earnings.
        </>,
        <>
          {fmtMoney(m.cashAndInvestments?.value)} of cash and investments,
          burning {fmtMoney(m.quarterlyBurn?.value)} a quarter (4-qtr avg{" "}
          {fmtMoney(m.avgQuarterlyBurnTTM?.value)}): runway ≈{" "}
          {m.runwayQuartersLatest?.toFixed(1) ?? "n/a"} quarters
          {m.proFormaRunwayQuarters != null
            ? `, ${m.proFormaRunwayQuarters.toFixed(1)} pro forma for announced deals`
            : ""}
          .{" "}
          {m.quarterlyBurn && (
            <SourceLink source={m.quarterlyBurn.source} compact />
          )}
        </>,
        <>
          {fmtShares(m.sharesOutstanding?.value)} shares outstanding,{" "}
          {fmtPct(m.dilution?.totalPct, 0, true)} since{" "}
          {m.dilution?.first.date ?? "n/a"} ({fmtPct(m.dilution?.annualPct, 1)}
          /yr).{" "}
          {m.sharesOutstanding && (
            <SourceLink source={m.sharesOutstanding.source} compact />
          )}
        </>,
      ]}
    />
  );
}

export async function ValuationSummary() {
  await connection();
  const res = await runDefaultModel();
  if (!res.ok) return <Unavailable what="Summary" error={res.error} />;
  const r = res.data;
  return (
    <KeySummary
      lines={[
        <>
          Probability-weighted value{" "}
          <strong>{fmtPrice(r.weighted.target)}</strong> vs.{" "}
          {fmtPrice(r.data.company.currentPrice)} today (
          {fmtPct(r.weighted.upside, 0, true)}):{" "}
          <strong>{r.recommendation}</strong> under the ±15% rule.{" "}
          <SourceLink source={r.data.sources.price} compact />
        </>,
        <>
          Bear / base / bull: {fmtPrice(r.prices.bear)} /{" "}
          {fmtPrice(r.prices.base)} / {fmtPrice(r.prices.bull)}. Most of the
          expected value comes from the bull case.
        </>,
        <>
          Reverse DCF: today&apos;s price implies ~
          {r.impliedFleet
            ? Math.round(r.impliedFleet).toLocaleString("en-US")
            : "n/a"}{" "}
          aircraft at scale vs.{" "}
          {r.scenarios[1].fleetAtScale.toLocaleString("en-US")} in the base
          case. Biggest drivers:{" "}
          {r.topDrivers
            .slice(0, 3)
            .map((d) => d.label.toLowerCase())
            .join(", ")}
          .
        </>,
      ]}
    />
  );
}

export async function NewsSummary() {
  await connection();
  const [news, prof] = await Promise.all([
    safe(() => getNews()),
    safe(() => getProfile(TICKER)),
  ]);
  if (!news.ok) return <Unavailable what="Summary" error={news.error} />;
  const cutoff = msAgo(30);
  const recent = news.data.items.filter(
    (n) => n.jobySpecific && Date.parse(n.publishedAt) >= cutoff,
  );
  const count = (t: string) => recent.filter((n) => n.tag === t).length;
  const top = recent.find((n) => n.tag === "catalyst");
  const risk = recent.find((n) => n.tag === "risk");
  const next = prof.ok ? prof.data.earningsDates[0] : null;
  return (
    <KeySummary
      lines={[
        <>
          Last 30 days: {recent.length} Joby headlines, {count("catalyst")}{" "}
          tagged catalyst and {count("risk")} risk (keyword rules). Next
          earnings: {next ? fmtDate(next, true) : "n/a"}.
        </>,
        top ? (
          <>
            Latest catalyst:{" "}
            <a
              className="underline decoration-dotted"
              href={top.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {top.title}
            </a>{" "}
            ({top.publisher}, {fmtDate(top.publishedAt)}).
          </>
        ) : (
          <>No catalyst-tagged headlines in the last 30 days.</>
        ),
        risk ? (
          <>
            Latest risk:{" "}
            <a
              className="underline decoration-dotted"
              href={risk.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {risk.title}
            </a>{" "}
            ({risk.publisher}, {fmtDate(risk.publishedAt)}).
          </>
        ) : (
          <>No risk-tagged headlines in the last 30 days.</>
        ),
      ]}
    />
  );
}

export async function RisksSummary() {
  await connection();
  const [fin, hl] = await Promise.all([
    safe(() => getFinancials()),
    safe(() => getLatestPeriodicHighlights()),
  ]);
  const m = fin.ok ? computeKeyMetrics(fin.data) : null;
  const cert = hl.ok ? certificationLine(hl.data.certification) : null;
  return (
    <KeySummary
      lines={[
        <>
          <strong>Certification:</strong>{" "}
          {cert ? `“${cert}”` : "status unavailable"}{" "}
          {hl.ok && (
            <SourceLink
              source={{
                label: `SEC ${hl.data.filing.form}`,
                url: hl.data.filing.url,
                asOf: hl.data.filing.filed,
              }}
              compact
            />
          )}
        </>,
        <>
          <strong>Cash & dilution:</strong> ≈
          {m?.runwayQuartersLatest?.toFixed(1) ?? "n/a"} quarters of runway at
          the latest burn; shares {fmtPct(m?.dilution?.totalPct, 0, true)} since{" "}
          {m?.dilution?.first.date ?? "n/a"}.{" "}
          {m?.quarterlyBurn && (
            <SourceLink source={m.quarterlyBurn.source} compact />
          )}
        </>,
        <>
          <strong>Legal:</strong>{" "}
          {hl.ok && hl.data.legal[0]
            ? `“${hl.data.legal[0]}”`
            : "no litigation disclosures found"}{" "}
          {hl.ok && hl.data.legal[0] && (
            <SourceLink
              source={{
                label: `SEC ${hl.data.filing.form}`,
                url: hl.data.filing.url,
                asOf: hl.data.filing.filed,
              }}
              compact
            />
          )}
        </>,
      ]}
    />
  );
}
