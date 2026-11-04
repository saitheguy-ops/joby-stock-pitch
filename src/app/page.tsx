import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import {
  Badge,
  Card,
  Skeleton,
  SourceLink,
  Unavailable,
} from "@/components/ui";
import {
  ageInDays,
  findSection,
  parseEvents,
  parseScorecard,
  type Briefing,
  type Rating,
} from "@/lib/briefing";
import {
  listArchivedBriefings,
  loadBriefing,
  loadSnapshot,
} from "@/lib/briefing-load";
import { TICKER } from "@/lib/config";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { yahooSource } from "@/lib/joby";
import { safe } from "@/lib/sources";
import { STALE_DAYS } from "@/lib/snapshot/validate";
import { getQuote } from "@/lib/yahoo";

const REPO_BLOB = "https://github.com/saitheguy-ops/joby-stock-pitch/blob/main";

export default function BriefingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[80vh]" />}>
      <BriefingBody />
    </Suspense>
  );
}

const verdictTone = (v: string) =>
  v === "BUY" ? "good" : v === "SELL" ? "bad" : "neutral";

async function BriefingBody() {
  await connection();
  const res = await safe(loadBriefing);
  if (!res.ok) {
    return (
      <Unavailable
        what="The briefing (content/briefing.md)"
        error={`${res.error}. Ask Claude Code to "refresh the Joby briefing" (see docs/REFRESH.md).`}
        source={{
          label: "docs/REFRESH.md",
          url: `${REPO_BLOB}/docs/REFRESH.md`,
        }}
      />
    );
  }
  const b = res.data;
  const snap = await safe(loadSnapshot);
  const dataAsOf = b.meta.data_as_of || (snap.ok ? snap.data.generatedAt : "");
  const age = ageInDays(dataAsOf, new Date().toISOString());
  const stale = age !== null && age > STALE_DAYS;
  const score = parseScorecard(
    findSection(b, "Status scorecard")?.markdown ?? "",
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Joby Aviation (NYSE: JOBY) · Briefing
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Last updated <strong>{fmtDate(b.meta.date)}</strong> — data as of{" "}
          <strong>{fmtDate(dataAsOf, true)}</strong>
          {snap.ok && (
            <>
              {" "}
              ·{" "}
              <a
                className="underline decoration-dotted"
                href={`${REPO_BLOB}/data/snapshot.json`}
                target="_blank"
                rel="noopener noreferrer"
              >
                snapshot
              </a>
            </>
          )}
        </p>
        {stale && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <strong>This briefing is {age} days old.</strong> Prices, filings
            and news have likely moved on. Ask Claude Code to &quot;refresh the
            Joby briefing&quot; (docs/REFRESH.md), and check the live Details
            pages before relying on it.
          </div>
        )}
      </header>

      <VerdictHero b={b} />

      {score.length > 0 && (
        <section aria-labelledby="scorecard">
          <h2
            id="scorecard"
            className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Status scorecard
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {score.map((s) => (
              <ScoreCard
                key={s.area}
                area={s.area}
                rating={s.rating}
                reason={s.reason}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <BriefingSection
            b={b}
            heading="Verdict and what changed since last time"
          />
          <BriefingSection b={b} heading="What changed" />
          <BriefingSection b={b} heading="What it means for the price" />
          <BriefingSection b={b} heading="Things to watch" />
        </div>
        <div className="min-w-0 space-y-6">
          <EventsTimeline b={b} />
          <DetailsLinks />
          <Suspense fallback={null}>
            <History />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function VerdictHero({ b }: { b: Briefing }) {
  const m = b.meta;
  const upside =
    m.price_target !== null && m.price_at_writing
      ? m.price_target / m.price_at_writing - 1
      : null;
  const changed = m.previous_verdict && m.previous_verdict !== m.verdict;
  const targetDelta =
    m.previous_price_target !== null && m.price_target !== null
      ? m.price_target - m.previous_price_target
      : null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Verdict
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span
              className={`text-4xl font-black tracking-tight ${m.verdict === "BUY" ? "text-emerald-700 dark:text-emerald-400" : m.verdict === "SELL" ? "text-rose-700 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}
            >
              {m.verdict || "—"}
            </span>
            {m.previous_verdict && (
              <Badge tone={changed ? "warn" : "neutral"}>
                {changed ? `changed from ${m.previous_verdict}` : "unchanged"}
                {m.previous_date ? ` (vs ${fmtDate(m.previous_date)})` : ""}
              </Badge>
            )}
          </div>
        </div>
        <dl className="tabular grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Price target
            </dt>
            <dd className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmtPrice(m.price_target)}
            </dd>
            {targetDelta !== null && (
              <dd className="text-xs text-slate-500 dark:text-slate-400">
                {Math.abs(targetDelta) < 0.005
                  ? "same as last time"
                  : `${targetDelta > 0 ? "+" : "−"}$${Math.abs(targetDelta).toFixed(2)} vs ${fmtPrice(m.previous_price_target)}`}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Price when written
            </dt>
            <dd className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmtPrice(m.price_at_writing)}
            </dd>
            {upside !== null && (
              <dd className="text-xs text-slate-500 dark:text-slate-400">
                target implies {fmtPct(upside, 0, true)}
              </dd>
            )}
          </div>
          <Suspense fallback={<div />}>
            <LivePrice />
          </Suspense>
        </dl>
      </div>
    </section>
  );
}

async function LivePrice() {
  const q = await safe(() => getQuote(TICKER));
  if (!q.ok || q.data.price === null) return <div />;
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">Live price</dt>
      <dd className="text-2xl font-bold text-slate-900 dark:text-white">
        {fmtPrice(q.data.price)}
      </dd>
      <dd>
        <SourceLink source={yahooSource(q.data)} compact />
      </dd>
    </div>
  );
}

const RATING_META: Record<Rating, { icon: string; cls: string }> = {
  improving: {
    icon: "▲",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  stable: {
    icon: "■",
    cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  worsening: {
    icon: "▼",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
  },
};

function ScoreCard({
  area,
  rating,
  reason,
}: {
  area: string;
  rating: Rating;
  reason: string;
}) {
  const r = RATING_META[rating];
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {area}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${r.cls}`}
        >
          <span aria-hidden>{r.icon}</span>
          {rating}
        </span>
      </div>
      <Markdown
        inline
        className="mt-1.5 block text-xs leading-relaxed text-slate-600 dark:text-slate-400"
      >
        {reason}
      </Markdown>
    </div>
  );
}

function BriefingSection({ b, heading }: { b: Briefing; heading: string }) {
  const s = findSection(b, heading);
  if (!s) return null;
  return (
    <Card title={heading}>
      <Markdown className="prose-sm prose-li:my-1 prose-ul:my-1">
        {s.markdown}
      </Markdown>
    </Card>
  );
}

function EventsTimeline({ b }: { b: Briefing }) {
  const s = findSection(b, "Upcoming events");
  if (!s) return null;
  const events = parseEvents(s.markdown);
  if (!events.length)
    return <BriefingSection b={b} heading="Upcoming events" />;
  return (
    <Card title="Upcoming events">
      <ol className="relative space-y-4 border-l border-slate-200 pl-4 dark:border-slate-700">
        {events.map((e) => (
          <li key={e.when + e.text}>
            <span
              aria-hidden
              className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-sky-600 dark:bg-sky-400"
            />
            <div className="tabular text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
              {e.when}
            </div>
            <Markdown
              inline
              className="mt-0.5 block text-sm text-slate-800 dark:text-slate-200"
            >
              {e.text}
            </Markdown>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const DETAILS: { href: string; label: string; blurb: ReactNode }[] = [
  {
    href: "/overview",
    label: "Overview",
    blurb: "Price chart, market cap, what Joby does",
  },
  {
    href: "/financials",
    label: "Financials",
    blurb: "Statements, cash, burn, runway, dilution",
  },
  {
    href: "/valuation",
    label: "Valuation",
    blurb: "Scenario DCF, sensitivity, comps",
  },
  {
    href: "/news",
    label: "News & Catalysts",
    blurb: "Tagged headlines, filings, upcoming dates",
  },
  { href: "/risks", label: "Risks", blurb: "10-K risk themes with evidence" },
  { href: "/pitch", label: "The Pitch", blurb: "One-page printable pitch" },
];

function DetailsLinks() {
  return (
    <Card title="Details" subtitle="Live data behind the briefing">
      <ul className="grid gap-2">
        {DETAILS.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:hover:border-sky-600 dark:hover:bg-slate-800"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {d.label} →
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {d.blurb}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function History() {
  const list = await safe(listArchivedBriefings);
  if (!list.ok || list.data.length === 0) return null;
  return (
    <Card
      title="Briefing history"
      subtitle="Dated copies in content/briefings/"
    >
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 font-medium">Date</th>
            <th className="py-1 font-medium">Verdict</th>
            <th className="py-1 text-right font-medium">Target</th>
            <th className="py-1 text-right font-medium">Price then</th>
          </tr>
        </thead>
        <tbody>
          {list.data.slice(0, 8).map((h) => (
            <tr
              key={h.file}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="py-1">
                <a
                  className="underline decoration-dotted"
                  href={`${REPO_BLOB}/content/briefings/${h.file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {h.date}
                </a>
              </td>
              <td className="py-1">
                <Badge tone={verdictTone(h.verdict)}>{h.verdict}</Badge>
              </td>
              <td className="py-1 text-right">{fmtPrice(h.priceTarget)}</td>
              <td className="py-1 text-right">{fmtPrice(h.priceAtWriting)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
