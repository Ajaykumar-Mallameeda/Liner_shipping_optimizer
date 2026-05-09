/**
 * Zustand store for dashboard state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useDashboardStore = create(
  subscribeWithSelector((set, get) => ({
    // Pipeline state
    pipelineStatus: 'idle',
    currentIteration: 0,
    totalIterations: 0,
    currentStage: null,
    stages: [],
    pipelineStartTime: null,
    pipelineEndTime: null,

    // Metrics
    metrics: {
      weeklyProfit: 0,
      annualProfit: 0,
      totalCost: 0,
      totalServices: 0,
      coveragePercentage: 0,
      profitMargin: 0,
      vesselsUtilized: 0,
      totalTeuMoved: 0,
    },

    // Regional data
    regions: [],
    selectedRegion: null,

    // Iteration history
    iterations: [],
    selectedIteration: null,

    // Map data
    corridors: [],
    routes: [],
    ports: [],

    // Conflicts
    conflicts: [],
    conflictsResolved: 0,

    // UI state
    isLive: false,
    autoRefresh: true,
    refreshInterval: 5,
    connectionStatus: 'disconnected',
    lastUpdate: null,

    // Actions
    setPipelineStatus: (status) => set({ pipelineStatus: status }),

    setCurrentIteration: (iteration) => set({ currentIteration: iteration }),

    setTotalIterations: (total) => set({ totalIterations: total }),

    setCurrentStage: (stage) => set({ currentStage: stage }),

    setStages: (stages) => set({ stages }),

    updateStageProgress: (stageId, status, progress) => set((state) => ({
      stages: state.stages.map(stage =>
        stage.id === stageId ? { ...stage, status, progress } : stage
      )
    })),

    setMetrics: (metrics) => set({ metrics: { ...get().metrics, ...metrics } }),

    updateMetrics: (updates) => set((state) => ({
      metrics: { ...state.metrics, ...updates },
      lastUpdate: new Date().toISOString()
    })),

    setRegions: (regions) => set({ regions }),

    updateRegion: (regionId, updates) => set((state) => ({
      regions: state.regions.map(region =>
        region.id === regionId ? { ...region, ...updates } : region
      )
    })),

    setSelectedRegion: (regionId) => set({ selectedRegion: regionId }),

    setIterations: (iterations) => set({ iterations }),

    addIteration: (iteration) => set((state) => ({
      iterations: [...state.iterations, iteration]
    })),

    setSelectedIteration: (iteration) => set({ selectedIteration: iteration }),

    setCorridors: (corridors) => set({ corridors }),

    setRoutes: (routes) => set({ routes }),

    setPorts: (ports) => set({ ports }),

    updateMapData: (data) => set((state) => ({
      corridors: data.corridors || state.corridors,
      routes: data.routes || state.routes,
      ports: data.ports || state.ports
    })),

    setConflicts: (conflicts) => set({ conflicts }),

    resolveConflict: (conflictId) => set((state) => ({
      conflicts: state.conflicts.map(c =>
        c.id === conflictId ? { ...c, status: 'resolved' } : c
      ),
      conflictsResolved: state.conflictsResolved + 1
    })),

    setConnectionStatus: (status) => set({ connectionStatus: status }),

    setIsLive: (isLive) => set({ isLive }),

    setAutoRefresh: (autoRefresh) => set({ autoRefresh }),

    setRefreshInterval: (interval) => set({ refreshInterval: interval }),

    // Reset state
    resetState: () => set({
      pipelineStatus: 'idle',
      currentIteration: 0,
      totalIterations: 0,
      currentStage: null,
      pipelineStartTime: null,
      pipelineEndTime: null,
      iterations: [],
      conflicts: [],
      conflictsResolved: 0,
      lastUpdate: null
    }),

    // Getters
    getRegionById: (regionId) => get().regions.find(r => r.id === regionId),

    getIterationByNumber: (number) => get().iterations.find(i => i.iteration === number),

    getCurrentIterationData: () => {
      const { iterations, currentIteration } = get();
      return iterations.find(i => i.iteration === currentIteration);
    },

    getActiveStages: () => get().stages.filter(s => s.status === 'running'),

    getCompletedStages: () => get().stages.filter(s => s.status === 'completed'),

    getUnresolvedConflicts: () => get().conflicts.filter(c => c.status !== 'resolved'),

    getProgressPercentage: () => {
      const { currentIteration, totalIterations } = get();
      return totalIterations > 0 ? (currentIteration / totalIterations) * 100 : 0;
    },

    // WebSocket event handlers
    handlePipelineStarted: (data) => set((state) => ({
      pipelineStatus: 'running',
      pipelineStartTime: data.timestamp || new Date().toISOString(),
      isLive: true
    })),

    handlePipelineCompleted: (data) => set((state) => {
      const results = data.results || data.data || {};
      return {
        pipelineStatus: 'completed',
        pipelineEndTime: data.timestamp || new Date().toISOString(),
        isLive: false,
        metrics: results ? { ...state.metrics, ...results } : state.metrics
      };
    }),

    handlePipelineStopped: (data) => set((state) => ({
      pipelineStatus: 'stopped',
      pipelineEndTime: data.timestamp || new Date().toISOString(),
      isLive: false
    })),

    handleStageStarted: (data) => set((state) => ({
      currentStage: data.stage,
      stages: state.stages.map(stage =>
        stage.name === data.stage
          ? { ...stage, status: 'running', progress: 0 }
          : stage
      )
    })),

    handleStageCompleted: (data) => set((state) => ({
      stages: state.stages.map(stage =>
        stage.name === data.stage
          ? { ...stage, status: 'completed', progress: 100 }
          : stage
      )
    })),

    handleStageProgress: (data) => set((state) => ({
      stages: state.stages.map(stage =>
        stage.name === data.stage
          ? { ...stage, progress: data.progress }
          : stage
      )
    })),

    handleRegionUpdate: (data) => set((state) => ({
      regions: state.regions.some(r => r.id === data.id)
        ? state.regions.map(r => r.id === data.id ? { ...r, ...data } : r)
        : [...state.regions, data]
    })),

    handleIterationUpdate: (data) => set((state) => ({
      currentIteration: data.iteration,
      iterations: state.iterations.some(i => i.iteration === data.iteration)
        ? state.iterations.map(i => i.iteration === data.iteration ? { ...i, ...data } : i)
        : [...state.iterations, data]
    })),

    handleMapUpdate: (data) => set((state) => ({
      corridors: data.corridors || state.corridors,
      routes: data.routes || state.routes,
      ports: data.ports || state.ports
    }))
  }))
);

// Subscribe to store changes for debugging
if (process.env.NODE_ENV === 'development') {
  useDashboardStore.subscribe(
    (state) => state,
    (state, prevState) => {
      console.log('Store changed:', {
        from: prevState.pipelineStatus,
        to: state.pipelineStatus,
        iteration: state.currentIteration,
        lastUpdate: state.lastUpdate
      });
    }
  );
}

export default useDashboardStore;