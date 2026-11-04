import "server-only";
import { getModelData, type ModelData } from "./joby";
import { DEFAULT_SCENARIOS } from "./scenarios";
import type { Result } from "./sources";
import { probabilityWeighted, recommend, runScenario, solveForInput, tornado, type Recommendation, type ScenarioInputs, type WeightedResult } from "./valuation";

export interface ModelRun {
  data: ModelData;
  scenarios: ScenarioInputs[];
  prices: Record<ScenarioInputs["id"], number>;
  weighted: WeightedResult;
  recommendation: Recommendation;
  impliedFleet: number | null;
  topDrivers: { label: string; swing: number }[];
}

/** Default scenarios with the live trailing burn filled in. */
export function defaultScenarios(annualBurnM: number): ScenarioInputs[] {
  return DEFAULT_SCENARIOS.map((s) => ({ ...s, preLaunchBurnM: Math.round(annualBurnM) }));
}

/** Run the default model on live data (used by the Valuation and Pitch pages). */
export async function runDefaultModel(): Promise<Result<ModelRun>> {
  const res = await getModelData();
  if (!res.ok) return res;
  const data = res.data;
  const scenarios = defaultScenarios(data.annualBurnM);
  const prices = Object.fromEntries(scenarios.map((s) => [s.id, runScenario(s, data.company).pricePerShare])) as ModelRun["prices"];
  const weighted = probabilityWeighted(scenarios.map((s) => ({ id: s.id, probability: s.probability, price: prices[s.id] })), data.company.currentPrice);
  const base = scenarios.find((s) => s.id === "base")!;
  return {
    ok: true,
    data: {
      data,
      scenarios,
      prices,
      weighted,
      recommendation: recommend(weighted.upside),
      impliedFleet: solveForInput(base, data.company, "fleetAtScale", 0, 100_000),
      topDrivers: tornado(base, data.company).slice(0, 4).map((t) => ({ label: t.label, swing: t.swing })),
    },
  };
}
