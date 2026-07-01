/**
 * Runtime Adapter — single normalization layer for pipeline_output.json
 * and WebSocket payloads. Components consume normalized schema only.
 */

export const RUNTIME_TRUTH_URL = '/pipeline_output.json';

const REGION_COLORS = {
  asia: '#00d4ff',
  europe: '#7c3aed',
  americas: '#10b981',
  middle_east: '#f59e0b',
  africa: '#ef4444',
};

export function getRegionColor(regionId) {
  return REGION_COLORS[regionId] || '#00d4ff';
}

export function normalizeRegion(data) {
  if (!data) return {};
  return {
    profit: data.weekly_profit ?? data.profit ?? null,
    annualProfit: data.annual_profit ?? data.annualProfit ?? null,
    coverage: data.coverage_percent ?? data.coverage ?? null,
    services: data.services_selected ?? data.services ?? null,
    margin: data.profit_margin_pct ?? data.margin ?? null,
    hubs: data.hub_ports ?? data.hubs ?? [],
    generated: data.services_generated ?? data.generated ?? null,
    filtered: data.services_filtered ?? data.filtered ?? null,
    selected: data.services_selected ?? data.selected ?? null,
    operating_cost: data.operating_cost ?? null,
    cost: data.total_cost ?? data.cost ?? null,
    uncovered: data.uncovered_teu ?? data.uncovered ?? null,
    fuelCost: data.fuel_cost ?? null,
    transship_cost: data.transship_cost ?? null,
    portCost: data.port_cost ?? null,
    strategy: data.strategy ?? null,
    explanation: data.explanation ?? null,
    status: data.status ?? null,
    satisfiedDemand: data.satisfied_demand ?? null,
    unservedDemand: data.unserved_demand ?? null,
    profitPerService: data.profit_per_service ?? null,
    costPerService: data.cost_per_service ?? null,
  };
}

export function normalizeIteration(data) {
  if (!data) return {};
  return {
    iter: data.iteration ?? data.iter ?? 0,
    profit: data.profit ?? 0,
    coverage: data.coverage ?? 0,
    score: data.convergence_score ?? data.score ?? 0,
    rerun: data.needs_rerun ?? data.rerun ?? false,
    reason: data.rerun_reason ?? data.reason ?? '',
    weights_used: data.weights_used ?? null,
  };
}

export function normalizeGlobal(runtime, prev = {}) {
  const sm = runtime.summary_metrics || {};
  const dm = runtime.decision_output || {};
  const ps = runtime.problem_stats || {};
  const m = runtime.metrics || {};

  return {
    weeklyProfit: sm.weekly_profit ?? m.weeklyProfit ?? prev.weeklyProfit ?? 0,
    annualProfit: sm.annual_profit ?? m.annualProfit ?? prev.annualProfit ?? 0,
    coverage: sm.coverage ?? m.coverage ?? prev.coverage ?? 0,
    totalServices: sm.total_services ?? m.totalServices ?? prev.totalServices ?? 0,
    operatingCost: sm.operating_cost ?? m.operatingCost ?? prev.operatingCost ?? 0,
    runtime: sm.total_runtime ?? m.runtime ?? prev.runtime ?? 0,
    unserved: sm.unserved_demand ?? m.unserved ?? prev.unserved ?? 0,
    margin: dm.global_metrics?.profit_margin_pct ?? m.margin ?? prev.margin ?? 0,
    revenue: sm.revenue ?? prev.revenue ?? null,
    fuelCost: sm.fuel_cost ?? prev.fuelCost ?? null,
    portCost: sm.port_cost ?? prev.portCost ?? null,
    transshipCost: sm.transship_cost ?? prev.transshipCost ?? null,
    satisfiedDemand: sm.satisfied_demand ?? prev.satisfiedDemand ?? null,
    convergence: dm.feedback?.convergence_score ?? m.convergenceScore ?? prev.convergence ?? 0,
    ports: ps.ports ?? prev.ports ?? null,
    lanes: ps.lanes ?? prev.lanes ?? null,
    services: ps.services ?? prev.services ?? null,
    weeklyDemand: ps.weekly_demand ?? m.weeklyDemand ?? prev.weeklyDemand ?? null,
    selected_services: runtime.selected_services ?? m.selected_services ?? prev.selected_services ?? [],
    decision_output: dm,
    test_scorecard: runtime.test_scorecard ?? prev.test_scorecard ?? {},
    llm_runtime_metrics: runtime.llm_runtime_metrics ?? prev.llm_runtime_metrics ?? {},
    executive_summary: runtime.executive_summary ?? prev.executive_summary ?? '',
  };
}

export function normalizeDecision(decisionOutput) {
  if (!decisionOutput) return {};
  return {
    global_metrics: decisionOutput.global_metrics ?? {},
    feedback: decisionOutput.feedback ?? {},
    evaluation: decisionOutput.evaluation ?? {},
    conflicts: decisionOutput.conflicts ?? [],
    resolution_log: decisionOutput.resolution_log ?? [],
    decisions: decisionOutput.decisions ?? [],
  };
}

export function regionIdFromBackend(r, index = 0) {
  return r.region
    ? r.region.toLowerCase().replace(/\s+/g, '_')
    : `region_${index}`;
}

export function regionDisplayName(regionId, fallback) {
  if (fallback) return fallback;
  if (regionId === 'middle_east') return 'Middle East';
  return regionId.charAt(0).toUpperCase() + regionId.slice(1);
}

export function normalizeRegionsFromArray(rawRegions) {
  const processed = {};
  rawRegions.forEach((r, index) => {
    const regionId = regionIdFromBackend(r, index);
    processed[regionId] = {
      ...normalizeRegion(r),
      id: regionId,
      name: regionDisplayName(regionId, r.name || r.region),
      color: getRegionColor(regionId),
      selected_services: r.selected_services || [],
    };
  });
  return processed;
}

export function normalizeRegionsFromObject(rawRegions) {
  const processed = {};
  Object.entries(rawRegions).forEach(([id, data]) => {
    processed[id] = {
      ...normalizeRegion(data),
      id,
      name: regionDisplayName(id, data.name),
      color: getRegionColor(id),
    };
  });
  return processed;
}

export function normalizeRegions(rawRegions) {
  if (Array.isArray(rawRegions)) {
    return normalizeRegionsFromArray(rawRegions);
  }
  if (rawRegions && typeof rawRegions === 'object') {
    return normalizeRegionsFromObject(rawRegions);
  }
  return {};
}

export function normalizeRuntime(runtime) {
  if (!runtime) {
    return { global: {}, regions: {}, iterations: [], corridors: [] };
  }

  return {
    global: normalizeGlobal(runtime),
    regions: normalizeRegions(runtime.regional_results || runtime.regions || {}),
    iterations: (runtime.iteration_audit || runtime.iterations || []).map(normalizeIteration),
    corridors: runtime.corridors || [],
  };
}
