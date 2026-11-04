"use client";

import { useState } from "react";

export interface StatementCell {
  display: string;
  url: string;
  title: string;
  derived?: boolean;
}
export interface StatementRow {
  label: string;
  concept: string;
  emphasis?: boolean;
  note?: string;
  computed?: boolean;
  cells: (StatementCell | null)[];
}
export interface StatementView {
  columns: { label: string; sub: string }[];
  rows: StatementRow[];
}

export function StatementTable({ caption, annual, quarterly, unitNote }: { caption: string; annual: StatementView; quarterly: StatementView; unitNote: string }) {
  const [mode, setMode] = useState<"annual" | "quarterly">("annual");
  const view = mode === "annual" ? annual : quarterly;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={`${caption} period`} className="no-print inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(["annual", "quarterly"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${mode === m ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">{unitNote}</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="tabular w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            {caption} ({mode})
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-right text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th scope="col" className="sticky left-0 bg-white py-2 pr-3 text-left font-medium dark:bg-slate-900">
                Line item
              </th>
              {view.columns.map((c) => (
                <th key={c.label} scope="col" className="px-2 py-2 font-medium">
                  <div className="text-slate-700 dark:text-slate-200">{c.label}</div>
                  <div className="font-normal">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.label} className={`border-b border-slate-100 dark:border-slate-800 ${r.emphasis ? "font-semibold" : ""}`}>
                <th scope="row" className="sticky left-0 bg-white py-1.5 pr-3 text-left font-[inherit] dark:bg-slate-900" title={r.concept}>
                  <span className="text-slate-800 dark:text-slate-200">{r.label}</span>
                  {r.note && <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">{r.note}</span>}
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-2 py-1.5 text-right">
                    {c ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" title={c.title} className={`hover:text-sky-700 hover:underline dark:hover:text-sky-400 ${c.display.startsWith("(") ? "text-rose-700 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"}`}>
                        {c.display}
                        {c.derived && <sup className="text-[9px] text-slate-400">d</sup>}
                      </a>
                    ) : (
                      <span className="text-slate-400" title="Not reported in EDGAR XBRL for this period">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
