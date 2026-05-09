/**
 * Zustand store for dashboard state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PipelineState, ProblemStats, RegionData, GlobalMetrics, IterationData, MapCorridor, StageProgress } from '../api/types';

// ============================================================================
// Store Interface
// ============================================================================

interface DashboardStore {
  // Pipeline state
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error' | 'stopped';
  currentIteration: number;
  totalIterations: number;
  progress: number;
  error: string | null;

  // Problem data
  problemStats: ProblemStats | null;

  // Regional data
  regions: Record<string, RegionData>;

  // Global metrics
  metrics: GlobalMetrics | null;

  // Iteration history
  iterations: IterationData[];

  // Map data
  corridors: MapCorridor[];
  activeRoutes: MapCorridor[];

  // Stage progress
  stageProgress: StageProgress | null;

  // Timestamps
  lastUpdated: string | null;
  startTime: string | null;

  // Actions
  setPipelineStatus: (status: DashboardStore['pipelineStatus']) => void;
  setCurrentIteration: (iteration: number) => void;
  setTotalIterations: (iterations: number) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  setProblemStats: (stats: ProblemStats) => void;
  setRegion: (id: string, region: RegionData) => void;
  setRegions: (regions: Record<string, RegionData>) => void;
  setMetrics: (metrics: GlobalMetrics) => void;
  addIteration: (iteration: IterationData) => void;
  setIterations: (iterations: IterationData[]) => void;
  setCorridors: (corridors: MapCorridor[]) => void;
  setActiveRoutes: (routes: MapCorridor[]) => void;
  setStageProgress: (progress: StageProgress | null) => void;
  setLastUpdated: (timestamp: string) => void;
  setStartTime: (timestamp: string) => void;

  // Reset actions
  reset: () => void;
  resetPipeline: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: Omit<DashboardStore, 'setPipelineStatus' | 'setCurrentIteration' | 'setTotalIterations' | 'setProgress' | 'setError' | 'setProblemStats' | 'setRegion' | 'setRegions' | 'setMetrics' | 'addIteration' | 'setIterations' | 'setCorridors' | 'setActiveRoutes' | 'setStageProgress' | 'setLastUpdated' | 'setStartTime' | 'reset' | 'resetPipeline'> = {
  pipelineStatus: 'idle',
  currentIteration: 0,
  totalIterations: 3,
  progress: 0,
  error: null,
  problemStats: null,
  regions: {},
  metrics: null,
  iterations: [],
  corridors: [],
  activeRoutes: [],
  stageProgress: null,
  lastUpdated: null,
  startTime: null,
};

// ============================================================================
// Store Creation
// ============================================================================

export const useDashboardStore = create<DashboardStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Pipeline status actions
    setPipelineStatus: (status) => set({ pipelineStatus: status }),
    setCurrentIteration: (iteration) => set({ currentIteration: iteration }),
    setTotalIterations: (iterations) => set({ totalIterations: iterations }),
    setProgress: (progress) => set({ progress }),
    setError: (error) => set({ error }),

    // Problem data actions
    setProblemStats: (stats) => set({ problemStats: stats }),

    // Regional data actions
    setRegion: (id, region) => set((state) => ({
      regions: { ...state.regions, [id]: region }
    })),
    setRegions: (regions) => set({ regions }),

    // Global metrics actions
    setMetrics: (metrics) => set({ metrics }),

    // Iteration actions
    addIteration: (iteration) => set((state) => ({
      iterations: [...state.iterations, iteration]
    })),
    setIterations: (iterations) => set({ iterations }),

    // Map data actions
    setCorridors: (corridors) => set({ corridors }),
    setActiveRoutes: (routes) => set({ activeRoutes: routes }),

    // Stage progress actions
    setStageProgress: (progress) => set({ stageProgress: progress }),

    // Timestamp actions
    setLastUpdated: (timestamp) => set({ lastUpdated: timestamp }),
    setStartTime: (timestamp) => set({ startTime: timestamp }),

    // Reset actions
    reset: () => set(initialState),
    resetPipeline: () => set({
      pipelineStatus: 'idle',
      currentIteration: 0,
      progress: 0,
      error: null,
      stageProgress: null,
      lastUpdated: null,
      startTime: null,
    }),
  }))
);

// ============================================================================
// Store Selectors
// ============================================================================

export const usePipelineStatus = () => useDashboardStore((state) => state.pipelineStatus);
export const useCurrentIteration = () => useDashboardStore((state) => state.currentIteration);
export const useTotalIterations = () => useDashboardStore((state) => state.totalIterations);
export const useProgress = () => useDashboardStore((state) => state.progress);
export const useError = () => useDashboardStore((state) => state.error);
export const useProblemStats = () => useDashboardStore((state) => state.problemStats);
export const useRegions = () => useDashboardStore((state) => state.regions);
export const useRegion = (id: string) => useDashboardStore((state) => state.regions[id]);
export const useMetrics = () => useDashboardStore((state) => state.metrics);
export const useIterations = () => useDashboardStore((state) => state.iterations);
export const useCorridors = () => useDashboardStore((state) => state.corridors);
export const useActiveRoutes = () => useDashboardStore((state) => state.activeRoutes);
export const useStageProgress = () => useDashboardStore((state) => state.stageProgress);
export const useLastUpdated = () => useDashboardStore((state) => state.lastUpdated);
export const useStartTime = () => useDashboardStore((state) => state.startTime);

// ============================================================================
// Computed Selectors
// ============================================================================

export const useFormattedMetrics = () => {
  const metrics = useMetrics();

  if (!metrics) return null;

  return {
    ...metrics,
    weeklyProfitFormatted: `$${(metrics.weekly_profit / 1e6).toFixed(1)}M`,
    annualProfitFormatted: `$${(metrics.annual_profit / 1e9).toFixed(1)}B`,
    operatingCostFormatted: `$${(metrics.operating_cost / 1e6).toFixed(1)}M`,
    profitMarginFormatted: `${metrics.profit_margin_pct.toFixed(1)}%`,
    coverageFormatted: `${metrics.coverage.toFixed(1)}%`,
    uncoveredFormatted: `${metrics.uncovered_pct.toFixed(1)}%`,
    unservedDemandFormatted: `${(metrics.unserved_demand / 1e3).toFixed(0)}K TEU/wk`,
  };
};

export const useRegionList = () => {
  const regions = useRegions();
  return Object.values(regions).sort((a, b) => b.weekly_profit - a.weekly_profit);
};

export const useLatestIteration = () => {
  const iterations = useIterations();
  return iterations[iterations.length - 1];
};

export const useIsPipelineComplete = () => {
  const status = usePipelineStatus();
  return status === 'complete' || status === 'error' || status === 'stopped';
};

export const useRuntime = () => {
  const startTime = useStartTime();

  if (!startTime) return 0;

  const start = new Date(startTime);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 1000);
};