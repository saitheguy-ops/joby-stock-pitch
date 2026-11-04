import type { ReactNode } from "react";
import type { Source } from "@/lib/sources";
import { fmtDate } from "@/lib/format";

export function Card({ title, subtitle, children, className = "", actions }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`print-break-avoid rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small linked citation: "Source: SEC 10-Q · as of Jun 30, 2026 ↗". */
export function SourceLink({ source, className = "", compact = false }: { source: Source; className?: string; compact?: boolean }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source.label} (as of ${source.asOf})`}
      className={`inline-flex max-w-full items-baseline gap-1 text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-sky-700 dark:text-slate-400 dark:hover:text-sky-400 ${className}`}
    >
      <span className="truncate">{compact ? `as of ${fmtDate(source.asOf)}` : source.label}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

export function Stat({ label, value, sub, source, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; source?: Source | null; tone?: "good" | "bad" | "neutral" }) {
  const toneCls = tone === "good" ? "text-emerald-700 dark:text-emerald-400" : tone === "bad" ? "text-rose-700 dark:text-rose-400" : "text-slate-900 dark:text-slate-100";
  return (
    <div className="print-break-avoid min-w-0 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{sub}</div>}
      {source && <SourceLink source={source} className="mt-1" compact />}
    </div>
  );
}

export function Unavailable({ what, error, source }: { what: string; error?: string; source?: { label: string; url: string } }) {
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>{what} is unavailable right now.</strong> We show nothing rather than guess.
      {error && <span className="block text-xs opacity-80">Reason: {error}</span>}
      {source && (
        <span className="block text-xs">
          Check the source directly:{" "}
          <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">
            {source.label}
          </a>
        </span>
      )}
    </div>
  );
}

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{title}</h1>
      {intro && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{intro}</p>}
      {children}
    </header>
  );
}

export function Skeleton({ className = "h-40" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />;
}

/** Inline "i" with a native tooltip plus accessible text: explains why a number matters. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        aria-label={text}
        className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-500 dark:text-slate-400"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-md bg-slate-900 p-2 text-xs font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:bg-slate-700"
      >
        {text}
      </span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "bad" | "neutral" | "warn" | "info" }) {
  const cls = {
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    bad: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
