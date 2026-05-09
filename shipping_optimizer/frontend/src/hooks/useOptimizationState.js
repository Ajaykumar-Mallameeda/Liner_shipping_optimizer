/**
 * React Hook for Managing Optimization State
 * Connects WebSocket events to React state management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import websocketService from '../services/websocketService';

// Initial state structure matching the dashboard
const initialState = {
  // Global metrics
  global: {
    ports: 435,
    lanes: 9622,
    services: 1200,
    weeklyDemand: 833484,
    runtime: 356.1,
    iterations: 3,
    convergence: 0.982,
    weeklyProfit: 773616415,
    annualProfit: 40228053557,
    coverage: 59.5,
    totalServices: 465,
    margin: 84.0,
    unserved: 337374,
    operatingCost: 146921209
  },

  // Regional data
  regions: [
    { id: "asia", name: "Asia", color: "#00d4ff", profit: 106904049, coverage: 76.9, services: 99, margin: 79.7, cost: 20610000, uncovered: 24978, hubs: [146, 176, 282, 48, 102], strategy: "hybrid", generated: 802, filtered: 400, selected: 99 },
    { id: "europe", name: "Europe", color: "#7c3aed", profit: 71797633, coverage: 49.7, services: 88, margin: 71.7, cost: 20250000, uncovered: 88188, hubs: [221, 36, 75, 13, 86], strategy: "hybrid", generated: 896, filtered: 400, selected: 88 },
    { id: "americas", name: "Americas", color: "#10b981", profit: 466846485, coverage: 56.4, services: 94, margin: 92.0, cost: 20140000, uncovered: 180468, hubs: [235, 285, 100, 129, 41], strategy: "hybrid", generated: 826, filtered: 400, selected: 94 },
    { id: "middle_east", name: "Middle East", color: "#f59e0b", profit: 55850044, coverage: 86.2, services: 77, margin: 73.9, cost: 17340000, uncovered: 4776, hubs: [229, 225, 190, 108, 220], strategy: "hybrid", generated: 764, filtered: 400, selected: 77 },
    { id: "africa", name: "Africa", color: "#ef4444", profit: 72218205, coverage: 61.7, services: 107, margin: 70.1, cost: 21030000, uncovered: 38964, hubs: [113, 112, 69, 114, 204], strategy: "hybrid", generated: 812, filtered: 400, selected: 107 }
  ],

  // Iteration history
  iterations: [
    { iter: 0, profit: 740786392, coverage: 64.7, score: 0.975, rerun: true, reason: "coverage 64.7% is 5.3pp below 70.0% target" },
    { iter: 1, profit: 771721477, coverage: 66.0, score: 0.981, rerun: true, reason: "coverage 66.0% is 4.0pp below 70.0% target" },
    { iter: 2, profit: 773616415, coverage: 66.2, score: 0.982, rerun: false, reason: "[CAPPED] max iterations reached" }
  ],

  // Corridors for map
  corridors: [
    { from: "Port 285", to: "Port 146", teu: 10902, region: "americas" },
    { from: "Port 235", to: "Port 36", teu: 5292, region: "americas" },
    { from: "Port 235", to: "Port 146", teu: 4938, region: "americas" },
    { from: "Port 221", to: "Port 100", teu: 1932, region: "europe" },
    { from: "Port 112", to: "Port 176", teu: 1128, region: "africa" }
  ],

  // Pipeline state
  pipeline: {
    isRunning: false,
    currentStage: null,
    stageProgress: 0,
    currentIteration: 0,
    maxIterations: 3,
    error: null
  }
};

export function useOptimizationState() {
  const [state, setState] = useState(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const stateRef = useRef(state);
  const updatesRef = useRef([]);

  // Update ref when state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Batch updates to prevent excessive re-renders
  const batchUpdate = useCallback((updater) => {
    updatesRef.current.push(updater);

    // Process updates on next tick
    if (updatesRef.current.length === 1) {
      setTimeout(() => {
        const updates = updatesRef.current;
        updatesRef.current = [];

        setState(prevState => {
          let newState = prevState;
          updates.forEach(update => {
            newState = update(newState);
          });
          return newState;
        });
      }, 0);
    }
  }, []);

  // Handle pipeline started
  const handlePipelineStarted = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        isRunning: true,
        currentStage: 'Initializing',
        stageProgress: 0,
        currentIteration: 0,
        error: null
      }
    }));
  }, [batchUpdate]);

  // Handle stage started
  const handleStageStarted = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        currentStage: data.stage || data.data?.stage,
        stageProgress: 0
      }
    }));
  }, [batchUpdate]);

  // Handle stage progress
  const handleStageProgress = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        stageProgress: data.progress || 0
      }
    }));
  }, [batchUpdate]);

  // Handle stage completed
  const handleStageCompleted = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        stageProgress: 100
      }
    }));
  }, [batchUpdate]);

  // Handle iteration started
  const handleIterationStarted = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        currentIteration: data.iteration || 0,
        maxIterations: data.max_iterations || 3
      }
    }));
  }, [batchUpdate]);

  // Handle iteration completed
  const handleIterationCompleted = useCallback((data) => {
    batchUpdate(prevState => {
      const newIteration = {
        iter: data.iteration || data.iter,
        profit: data.profit || 0,
        coverage: data.coverage || 0,
        score: data.score || 0,
        rerun: data.rerun || false,
        reason: data.reason || 'Completed'
      };

      return {
        ...prevState,
        iterations: [...prevState.iterations, newIteration],
        // Update global metrics if available
        global: {
          ...prevState.global,
          weeklyProfit: data.profit || prevState.global.weeklyProfit,
          coverage: data.coverage || prevState.global.coverage,
          totalServices: data.total_services || prevState.global.totalServices,
          margin: data.margin || prevState.global.margin,
          operatingCost: data.operating_cost || prevState.global.operatingCost
        }
      };
    });
  }, [batchUpdate]);

  // Handle region updated
  const handleRegionUpdated = useCallback((data) => {
    batchUpdate(prevState => {
      const regionIndex = prevState.regions.findIndex(r =>
        r.id === data.region_id || r.id === data.id
      );

      if (regionIndex === -1) return prevState;

      const newRegions = [...prevState.regions];
      newRegions[regionIndex] = {
        ...newRegions[regionIndex],
        profit: data.profit || newRegions[regionIndex].profit,
        coverage: data.coverage || newRegions[regionIndex].coverage,
        services: data.services || newRegions[regionIndex].services,
        margin: data.margin || newRegions[regionIndex].margin,
        uncovered: data.uncovered || newRegions[regionIndex].uncovered
      };

      // Recalculate global metrics
      const totalProfit = newRegions.reduce((sum, r) => sum + r.profit, 0);
      const avgCoverage = newRegions.reduce((sum, r) => sum + r.coverage, 0) / newRegions.length;
      const totalServices = newRegions.reduce((sum, r) => sum + r.services, 0);
      const totalCost = newRegions.reduce((sum, r) => sum + (r.cost || 0), 0);

      return {
        ...prevState,
        regions: newRegions,
        global: {
          ...prevState.global,
          weeklyProfit: totalProfit,
          annualProfit: totalProfit * 52,
          coverage: avgCoverage,
          totalServices: totalServices,
          margin: (totalProfit / (totalProfit + totalCost)) * 100
        }
      };
    });
  }, [batchUpdate]);

  // Handle convergence reached
  const handleConvergenceReached = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      global: {
        ...prevState.global,
        convergence: data.score || prevState.global.convergence
      }
    }));
  }, [batchUpdate]);

  // Handle map updated
  const handleMapUpdated = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      corridors: data.corridors || prevState.corridors
    }));
  }, [batchUpdate]);

  // Handle pipeline completed
  const handlePipelineCompleted = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        isRunning: false,
        currentStage: null,
        stageProgress: 0
      },
      global: {
        ...prevState.global,
        ...data.results
      }
    }));
  }, [batchUpdate]);

  // Handle pipeline error
  const handlePipelineError = useCallback((data) => {
    batchUpdate(prevState => ({
      ...prevState,
      pipeline: {
        ...prevState.pipeline,
        isRunning: false,
        error: data.error || 'Unknown error occurred'
      }
    }));
  }, [batchUpdate]);

  // Connect to WebSocket and set up event handlers
  useEffect(() => {
    // Connect to WebSocket
    websocketService.connect().then(() => {
      setIsConnected(true);
    }).catch(error => {
      console.error('Failed to connect to WebSocket:', error);
      setIsConnected(false);
    });

    // Register event handlers
    websocketService.on('pipeline_started', handlePipelineStarted);
    websocketService.on('stage_started', handleStageStarted);
    websocketService.on('stage_progress', handleStageProgress);
    websocketService.on('stage_completed', handleStageCompleted);
    websocketService.on('iteration_started', handleIterationStarted);
    websocketService.on('iteration_completed', handleIterationCompleted);
    websocketService.on('region_updated', handleRegionUpdated);
    websocketService.on('convergence_reached', handleConvergenceReached);
    websocketService.on('map_updated', handleMapUpdated);
    websocketService.on('pipeline_completed', handlePipelineCompleted);
    websocketService.on('pipeline_error', handlePipelineError);

    // Cleanup on unmount
    return () => {
      websocketService.disconnect();
      setIsConnected(false);
    };
  }, [
    handlePipelineStarted,
    handleStageStarted,
    handleStageProgress,
    handleStageCompleted,
    handleIterationStarted,
    handleIterationCompleted,
    handleRegionUpdated,
    handleConvergenceReached,
    handleMapUpdated,
    handlePipelineCompleted,
    handlePipelineError
  ]);

  // Function to start optimization
  const startOptimization = useCallback((config = {}) => {
    websocketService.startPipeline(config);
  }, []);

  // Return state and control functions
  return {
    ...state,
    isConnected,
    startOptimization,
    isPipelineRunning: state.pipeline.isRunning,
    currentStage: state.pipeline.currentStage,
    stageProgress: state.pipeline.stageProgress,
    currentIteration: state.pipeline.currentIteration,
    maxIterations: state.pipeline.maxIterations,
    pipelineError: state.pipeline.error
  };
}

export default useOptimizationState;