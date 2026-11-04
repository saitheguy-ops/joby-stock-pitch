"use client";

import { useMemo, useState } from "react";
import { ASSUMPTION_DOCS, SCENARIO_STORIES, type AssumptionDoc } from "@/lib/scenarios";
import {
  probabilityWeighted,
  recommend,
  runScenario,
  sensitivityGrid,
  solveForInput,
  tornado,
  type CompanyInputs,
  type ScenarioInputs,
  type ScenarioResult,
} from "@/lib/valuation";
import { Badge, Card, InfoTip } from "./ui";

const usd = (v: number) => `$${v.toFixed(2)}`;
const mUsd = (m: number) => {
  const a = Math.abs(m);
  const s = m < 0 ? "−" : "";
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(2)}B` : `${s}$${a.toFixed(0)}M`;
};
const pct = (v: number, signed = false) => `${signed && v > 0 ? "+" : ""}${(v * 100).toFixed(0).replace("-", "−")}%`;

const isPct = (d: AssumptionDoc) => d.unit === "%";
const toDisplay = (d: AssumptionDoc, v: number) => (isPct(d) ? +(v * 100).toFixed(2) : v);
const fromDisplay = (d: AssumptionDoc, v: number) => (isPct(d) ? v / 100 : v);

const SCEN_STYLE: Record<ScenarioInputs["id"], string> = {
  bear: "text-rose-700 dark:text-rose-400",
  base: "text-slate-900 dark:text-slate-100",
  bull: "text-emerald-700 dark:text-emerald-400",
};

export function ValuationModel({ company, defaults }: { company: CompanyInputs; defaults: ScenarioInputs[] }) {
  const [scenarios, setScenarios] = useState<ScenarioInputs[]>(defaults);
  const [focus, setFocus] = useState<ScenarioInputs["id"]>("base");

  const results = useMemo(() => scenarios.map((s) => ({ s, r: runScenario(s, company) })), [scenarios, company]);
  const weighted = useMemo(
    () => probabilityWeighted(results.map(({ s, r }) => ({ id: s.id, probability: s.probability, price: r.pricePerShare })), company.currentPrice),
    [results, company.currentPrice],
  );
  const rec = recommend(weighted.upside);
  const focused = scenarios.find((s) => s.id === focus)!;
  const focusedResult = results.find((x) => x.s.id === focus)!.r;

  const update = (id: ScenarioInputs["id"], key: keyof ScenarioInputs, value: number | string) =>
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  const changed = JSON.stringify(scenarios) !== JSON.stringify(defaults);

  return (
    <div className="space-y-6">
      {/* ---------- Results summary ---------- */}
      <div className="grid gap-3 md:grid-cols-4">
        {results.map(({ s, r }) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${SCEN_STYLE[s.id]}`}>{s.name} case</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">p = {pct(weighted.weights.find((w) => w.id === s.id)!.weight)}</span>
            </div>
            <div className="tabular mt-1 text-2xl font-bold text-slate-900 dark:text-white">{usd(r.pricePerShare)}</div>
            <div className="tabular text-xs text-slate-600 dark:text-slate-400">{pct(r.upside, true)} vs {usd(company.currentPrice)}</div>
          </div>
        ))}
        <div className="rounded-xl border-2 border-slate-900 bg-white p-4 dark:border-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Probability-weighted
              <InfoTip text="Σ (probability × scenario price). This is the expected value across scenarios, not the most likely outcome." />
            </span>
            <Badge tone={rec === "BUY" ? "good" : rec === "SELL" ? "bad" : "neutral"}>{rec}</Badge>
          </div>
          <div className="tabular mt-1 text-2xl font-bold text-slate-900 dark:text-white">{usd(weighted.target)}</div>
          <div className="tabular text-xs text-slate-600 dark:text-slate-400">
            {pct(weighted.upside, true)} · range {usd(weighted.low)}–{usd(weighted.high)}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Rule used for the label: upside above +15% = BUY, below −15% = SELL, otherwise HOLD. Probability-weighted target ={" "}
        {weighted.weights.map((w, i) => (
          <span key={w.id} className="tabular">
            {i > 0 && " + "}
            {pct(w.weight)} × {usd(w.price)}
          </span>
        ))}{" "}
        = <strong className="tabular">{usd(weighted.target)}</strong>.
      </p>

      <ScenarioBars results={results} target={weighted.target} current={company.currentPrice} />

      {/* ---------- Assumptions ---------- */}
      <Card
        title="Assumptions (editable)"
        subtitle="My assumptions, not company guidance. Hover the (i) for what each one means and why it matters. Results update instantly."
        actions={
          changed ? (
            <button onClick={() => setScenarios(defaults)} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
              Reset to defaults
            </button>
          ) : null
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {scenarios.map((s) => (
            <p key={s.id} className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              <span className={`font-semibold ${SCEN_STYLE[s.id]}`}>{s.name}:</span> {SCENARIO_STORIES[s.id]}
            </p>
          ))}
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Scenario assumptions</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 text-left font-medium">Assumption</th>
                {scenarios.map((s) => (
                  <th key={s.id} className={`w-28 py-2 text-right font-semibold ${SCEN_STYLE[s.id]}`}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ASSUMPTION_DOCS.map((d) => (
                <tr key={d.key} className="border-b border-slate-100 dark:border-slate-800">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-800 dark:text-slate-200">
                    {d.label}
                    <span className="text-xs text-slate-500"> ({d.unit === "$M" ? "$M" : d.unit})</span>
                    <InfoTip text={`${d.what} Why it matters: ${d.why}`} />
                  </th>
                  {scenarios.map((s) => (
                    <td key={s.id} className="py-1 pl-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label={`${s.name} ${d.label}`}
                        className="tabular w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-950"
                        step={isPct(d) ? d.step * 100 : d.step}
                        min={toDisplay(d, d.min)}
                        max={toDisplay(d, d.max)}
                        value={toDisplay(d, s[d.key] as number)}
                        disabled={(d.key === "terminalGrowth" && s.terminalMethod !== "growth") || (d.key === "exitMultiple" && s.terminalMethod !== "multiple")}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (e.target.value !== "" && Number.isFinite(v)) update(s.id, d.key, fromDisplay(d, Math.min(toDisplay(d, d.max), Math.max(toDisplay(d, d.min), v))));
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-slate-800 dark:text-slate-200">
                  Terminal value method
                  <InfoTip text="Exit multiple: value the business at a multiple of terminal-year EBITDA, like a buyer would. Perpetual growth (Gordon): value = next year's free cash flow ÷ (discount rate − growth). Use both as a cross-check." />
                </th>
                {scenarios.map((s) => (
                  <td key={s.id} className="py-1 pl-2 text-right">
                    <select
                      aria-label={`${s.name} terminal method`}
                      value={s.terminalMethod}
                      onChange={(e) => update(s.id, "terminalMethod", e.target.value)}
                      className="w-24 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
                    >
                      <option value="multiple">Multiple</option>
                      <option value="growth">Growth</option>
                    </select>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- Scenario detail ---------- */}
      <Card
        title="Scenario detail: projected cash flows"
        subtitle="Free cash flow = EBITDA − tax − capex for new aircraft, discounted to today."
        actions={<ScenarioPicker value={focus} onChange={setFocus} scenarios={scenarios} />}
      >
        <ScenarioDetail s={focused} r={focusedResult} company={company} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SensitivityTable s={focused} company={company} />
        <Tornado s={focused} company={company} />
      </div>

      <ReverseDcf base={scenarios.find((s) => s.id === "base")!} company={company} />
    </div>
  );
}

function ScenarioPicker({ value, onChange, scenarios }: { value: ScenarioInputs["id"]; onChange: (id: ScenarioInputs["id"]) => void; scenarios: ScenarioInputs[] }) {
  return (
    <div role="tablist" aria-label="Scenario" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
      {scenarios.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={value === s.id}
          onClick={() => onChange(s.id)}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${value === s.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function ScenarioBars({ results, target, current }: { results: { s: ScenarioInputs; r: ScenarioResult }[]; target: number; current: number }) {
  const max = Math.max(current, target, ...results.map((x) => x.r.pricePerShare)) * 1.1 || 1;
  const pos = (v: number) => `${(v / max) * 100}%`;
  const rows = [...results.map(({ s, r }) => ({ label: `${s.name}`, value: r.pricePerShare, strong: false })), { label: "Prob.-weighted", value: target, strong: true }];
  return (
    <Card title="Implied value per share vs. today's price">
      <div className="relative space-y-2 pb-6" role="img" aria-label={`Scenario prices: ${rows.map((r) => `${r.label} ${usd(r.value)}`).join(", ")}; current price ${usd(current)}`}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <div className={`w-28 shrink-0 text-xs ${row.strong ? "font-semibold" : ""} text-slate-700 dark:text-slate-300`}>{row.label}</div>
            <div className="relative h-5 flex-1">
              <div className="h-full rounded-r-[4px]" style={{ width: pos(row.value), background: row.strong ? "var(--series-2)" : "var(--series-1)", minWidth: row.value > 0 ? 2 : 0 }} />
            </div>
            <div className="tabular w-14 shrink-0 text-right text-xs font-semibold text-slate-800 dark:text-slate-200">{usd(row.value)}</div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 left-[calc(7rem+0.75rem)] right-[calc(3.5rem+0.75rem)]">
          <div className="absolute inset-y-0 border-l-2 border-dashed border-slate-900 dark:border-white" style={{ left: pos(current) }}>
            <span className="absolute -bottom-0.5 left-1 whitespace-nowrap text-[11px] font-semibold text-slate-900 dark:text-white">Price today {usd(current)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ScenarioDetail({ s, r, company }: { s: ScenarioInputs; r: ScenarioResult; company: CompanyInputs }) {
  return (
    <div className="space-y-3">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="tabular w-full min-w-[640px] text-right text-xs">
          <caption className="sr-only">{s.name} case annual projections ($ millions)</caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {["Year", "Fleet (end)", "Revenue", "Ramp w", "EBITDA", "Tax", "Aircraft capex", "FCF", "Disc. factor", "PV of FCF"].map((h) => (
                <th key={h} className="px-1.5 py-1.5 font-medium first:text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((y) => (
              <tr key={y.year} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-1.5 py-1 text-left">{y.year}</td>
                <td className="px-1.5 py-1">{Math.round(y.fleet).toLocaleString("en-US")}</td>
                <td className="px-1.5 py-1">{mUsd(y.revenueM)}</td>
                <td className="px-1.5 py-1">{y.rampWeight.toFixed(2)}</td>
                <td className={`px-1.5 py-1 ${y.ebitdaM < 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>{mUsd(y.ebitdaM)}</td>
                <td className="px-1.5 py-1">{mUsd(-y.taxM)}</td>
                <td className="px-1.5 py-1">{mUsd(-y.capexM)}</td>
                <td className={`px-1.5 py-1 font-semibold ${y.fcfM < 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>{mUsd(y.fcfM)}</td>
                <td className="px-1.5 py-1">{y.discountFactor.toFixed(3)}</td>
                <td className="px-1.5 py-1">{mUsd(y.pvFcfM)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {[
          ["Sum of PV(FCF)", mUsd(r.sumPvFcfM)],
          [`Terminal value (${r.terminalYear})`, mUsd(r.terminalValueM)],
          ["PV of terminal value", mUsd(r.pvTerminalM)],
          ["= Enterprise value", mUsd(r.enterpriseValueM)],
          ["+ Cash & investments", mUsd(company.cashAndInvestmentsM)],
          ["− Debt", mUsd(-company.debtM)],
          ["− Burn before forecast starts", mUsd(-company.stubBurnM)],
          ["= Equity value", mUsd(r.equityValueM)],
          ["÷ Shares after dilution", `${r.dilutedSharesM.toFixed(0)}M`],
          ["= Value per share", usd(r.pricePerShare)],
          ["Peak cumulative funding gap", r.peakFundingNeedM < 0 ? mUsd(r.peakFundingNeedM) : "none"],
          [
            "Terminal value share of EV",
            r.enterpriseValueM > 0 && r.terminalShareOfEV <= 1 ? pct(r.terminalShareOfEV) : "n/m (>100%: near-term FCF is negative)",
          ],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
            <dt className="text-slate-600 dark:text-slate-400">{k}</dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      {r.peakFundingNeedM < 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Funding gap: cumulative cash (today&apos;s cash minus burn) bottoms at {mUsd(r.peakFundingNeedM)}, so in this case Joby would need to raise at least that much more,
          which is why the dilution assumption exists.
        </p>
      )}
      {r.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-800 dark:text-amber-300">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}

function SensitivityTable({ s, company }: { s: ScenarioInputs; company: CompanyInputs }) {
  const rates = [-0.04, -0.02, 0, 0.02, 0.04].map((d) => Math.max(0.01, +(s.discountRate + d).toFixed(4)));
  const years = [-1, 0, 1, 2, 3].map((d) => s.launchYear + d);
  const grid = useMemo(() => sensitivityGrid(s, company, rates, years), [s, company]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title={`Sensitivity: ${s.name} case`} subtitle="Value per share by discount rate (rows) × commercial launch year (columns). Other assumptions held fixed.">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="tabular w-full min-w-[360px] text-center text-sm">
          <caption className="sr-only">Sensitivity of value per share to discount rate and launch year</caption>
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th className="py-1 text-left font-medium">Rate ↓ / Launch →</th>
              {years.map((y) => (
                <th key={y} className={`py-1 font-medium ${y === s.launchYear ? "text-slate-900 dark:text-white" : ""}`}>
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={rates[i]}>
                <th scope="row" className={`py-1 text-left text-xs font-medium ${rates[i] === s.discountRate ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                  {(rates[i] * 100).toFixed(1)}%
                </th>
                {row.map((v, j) => {
                  const above = v >= company.currentPrice;
                  const isBase = rates[i] === s.discountRate && years[j] === s.launchYear;
                  return (
                    <td
                      key={j}
                      className={`border border-white px-1 py-1.5 text-xs dark:border-slate-900 ${above ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"} ${isBase ? "font-bold ring-2 ring-inset ring-slate-900 dark:ring-white" : ""}`}
                    >
                      {usd(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Green = at or above today&apos;s {usd(company.currentPrice)}; red = below. Outlined cell = current assumptions. Each year of delay costs a year of burn and pushes value further out.
      </p>
    </Card>
  );
}

function Tornado({ s, company }: { s: ScenarioInputs; company: CompanyInputs }) {
  const bars = useMemo(() => tornado(s, company), [s, company]);
  const center = runScenario(s, company).pricePerShare;
  const max = Math.max(...bars.flatMap((b) => [b.lowPrice, b.highPrice]), center, 0.01);
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <Card title={`What matters most: ${s.name} case`} subtitle="Each bar flexes one assumption to a pessimistic and an optimistic value, everything else fixed. Longest bar = biggest driver.">
      <div className="space-y-2" role="list">
        {bars.map((b) => (
          <div key={b.key} role="listitem" className="text-xs">
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-medium">{b.label}</span>
              <span className="tabular text-slate-500 dark:text-slate-400">
                {b.lowLabel} → {usd(b.lowPrice)} · {b.highLabel} → {usd(b.highPrice)}
              </span>
            </div>
            <div className="relative mt-0.5 h-3 rounded bg-slate-100 dark:bg-slate-800">
              <div
                className="absolute inset-y-0 rounded-[4px]"
                style={{ left: x(Math.min(b.lowPrice, b.highPrice)), width: `calc(${x(Math.abs(b.highPrice - b.lowPrice))} + 2px)`, background: "var(--series-1)" }}
              />
              <div className="absolute inset-y-[-2px] w-0.5 bg-slate-900 dark:bg-white" style={{ left: x(center) }} aria-hidden />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Black tick = this case&apos;s value ({usd(center)}). Scale: $0 to {usd(max)}.</p>
    </Card>
  );
}

function ReverseDcf({ base, company }: { base: ScenarioInputs; company: CompanyInputs }) {
  const solved = useMemo(
    () => ({
      fleet: solveForInput(base, company, "fleetAtScale", 0, 100_000),
      rev: solveForInput(base, company, "revenuePerAircraftM", 0, 100),
      margin: solveForInput(base, company, "ebitdaMarginAtScale", -0.5, 0.95),
      rate: solveForInput(base, company, "discountRate", 0.01, 0.6),
    }),
    [base, company],
  );
  const items = [
    { label: "Aircraft in service at scale", v: solved.fleet, fmt: (v: number) => Math.round(v).toLocaleString("en-US"), vs: base.fleetAtScale.toLocaleString("en-US") },
    { label: "Revenue per aircraft", v: solved.rev, fmt: (v: number) => `$${v.toFixed(1)}M`, vs: `$${base.revenuePerAircraftM.toFixed(1)}M` },
    { label: "EBITDA margin at scale", v: solved.margin, fmt: (v: number) => pct(v), vs: pct(base.ebitdaMarginAtScale) },
    { label: "Discount rate", v: solved.rate, fmt: (v: number) => `${(v * 100).toFixed(1)}%`, vs: `${(base.discountRate * 100).toFixed(1)}%` },
  ];
  return (
    <Card title="Reverse DCF: what is the market pricing in?" subtitle={`Holding every other base-case assumption fixed, the value that makes the model equal today's ${usd(company.currentPrice)}.`}>
      <dl className="grid gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{it.label}</dt>
            <dd className="tabular text-lg font-semibold text-slate-900 dark:text-white">{it.v === null ? "no solution" : it.fmt(it.v)}</dd>
            <dd className="text-xs text-slate-500 dark:text-slate-400">base case: {it.vs}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        &quot;No solution&quot; means no value in a plausible range gets there on its own (for example, even a very low discount rate cannot rescue a case whose cash flows are mostly negative).
      </p>
    </Card>
  );
}
