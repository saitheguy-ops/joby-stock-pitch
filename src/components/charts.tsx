"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Formatters are chosen by name because functions can't cross the server/client boundary. */
export type ValueKind = "price" | "money" | "shares";

function fmt(kind: ValueKind, v: number, short = false): string {
  if (!Number.isFinite(v)) return "n/a";
  if (kind === "price") return `$${v.toFixed(2)}`;
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (kind === "money") {
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(short ? 1 : 2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(short ? 2 : 3)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

const axisTick = { fill: "var(--chart-text)", fontSize: 11 };

function TooltipBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="tabular font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      {note && <div className="text-slate-500 dark:text-slate-400">{note}</div>}
    </div>
  );
}

/** "Nov '25" for long ranges, "Nov 4" for short ones. */
const shortDate = (iso: string, long: boolean) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return long ? `${month} '${String(d.getUTCFullYear()).slice(2)}` : `${month} ${d.getUTCDate()}`;
};

/* ------------------------------------------------------------------ */

export interface PriceSeries {
  range: string;
  points: { date: string; close: number }[];
}

export function PriceChart({ series, defaultRange = "1Y" }: { series: PriceSeries[]; defaultRange?: string }) {
  const [range, setRange] = useState(series.find((s) => s.range === defaultRange) ? defaultRange : series[0]?.range);
  const active = series.find((s) => s.range === range) ?? series[0];
  if (!active) return null;
  const pts = active.points;
  const first = pts[0]?.close ?? 0;
  const last = pts[pts.length - 1]?.close ?? 0;
  const chg = first ? last / first - 1 : 0;
  const long = range !== "1M";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Price range" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {series.map((s) => (
            <button
              key={s.range}
              role="tab"
              aria-selected={s.range === range}
              onClick={() => setRange(s.range)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                s.range === range ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {s.range === "MAX" ? "Max" : s.range}
            </button>
          ))}
        </div>
        <div className="tabular text-xs text-slate-600 dark:text-slate-300">
          {shortDate(pts[0].date, true)} → {shortDate(pts[pts.length - 1].date, true)}:{" "}
          <span className={chg >= 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-rose-700 dark:text-rose-400"}>
            {chg >= 0 ? "+" : "−"}
            {Math.abs(chg * 100).toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-64 w-full sm:h-72" role="img" aria-label={`JOBY closing price, ${range} range, from $${first.toFixed(2)} to $${last.toFixed(2)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pts} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => shortDate(d, long)} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v.toFixed(v < 10 ? 1 : 0)}`} />
            <Tooltip
              cursor={{ stroke: "var(--chart-text)", strokeDasharray: "3 3" }}
              content={({ active: a, payload }) =>
                a && payload?.length ? (
                  <TooltipBox label={new Date(`${payload[0].payload.date}T12:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })} value={`$${Number(payload[0].value).toFixed(2)}`} note={active.range === "5Y" || active.range === "MAX" ? "weekly close" : "daily close"} />
                ) : null
              }
            />
            <Area type="monotone" dataKey="close" stroke="var(--series-1)" strokeWidth={2} fill="url(#priceFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface BarDatum {
  label: string;
  value: number;
  note?: string;
}

/** Single-series bar chart; negative values in the status-bad color when `signColors`. */
export function BarSeries({ data, kind, signColors = false, ariaLabel, height = 220 }: { data: BarDatum[]; kind: ValueKind; signColors?: boolean; ariaLabel: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmt(kind, v, true)} />
          <ReferenceLine y={0} stroke="var(--chart-text)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.length ? <TooltipBox label={String(payload[0].payload.label)} value={fmt(kind, Number(payload[0].value))} note={payload[0].payload.note} /> : null
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={signColors && d.value < 0 ? "var(--status-bad)" : "var(--series-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series step/line chart over dated points (e.g. share count). */
export function LineSeries({ data, kind, ariaLabel, height = 220 }: { data: { date: string; value: number; note?: string }[]; kind: ValueKind; ariaLabel: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={(d: string) => shortDate(d, true)} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => fmt(kind, v, true)} />
          <Tooltip
            cursor={{ stroke: "var(--chart-text)", strokeDasharray: "3 3" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox label={new Date(`${payload[0].payload.date}T12:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })} value={fmt(kind, Number(payload[0].value))} note={payload[0].payload.note} />
              ) : null
            }
          />
          <Line type="linear" dataKey="value" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--chart-surface)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
