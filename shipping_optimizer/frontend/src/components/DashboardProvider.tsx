/**
 * Dashboard Provider - Integrates API with store and components
 */

import React, { useEffect, ReactNode } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { usePipelineWebSocket } from '../hooks/useWebSocket';
import { useWebSocketEvent } from '../hooks/useWebSocket';
import { apiClient } from '../api/apiClient';
import { PipelineState } from '../api/types';

interface DashboardProviderProps {
  children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const {
    setPipelineStatus,
    setCurrentIteration,
    setTotalIterations,
    setProgress,
    setError,
    setProblemStats,
    setRegion,
    setRegions,
    setMetrics,
    addIteration,
    setCorridors,
    setActiveRoutes,
    setStageProgress,
    setLastUpdated,
    setStartTime,
    resetPipeline
  } = useDashboardStore();

  // WebSocket connection
  const { isConnected, connect, disconnect } = usePipelineWebSocket();

  // ============================================================================
  // WebSocket Event Handlers
  // ============================================================================

  // Initial state
  useWebSocketEvent('initial_state', (state: PipelineState) => {
    setPipelineStatus(state.status);
    setCurrentIteration(state.current_iteration);
    setTotalIterations(state.total_iterations);
    setProblemStats(state.problem_stats || null);
    setMetrics(state.metrics || null);
    setRegions(state.regions || {});
    setCorridors(state.corridors || []);
    setStartTime(state.start_time || null);
    setError(state.error || null);
  });

  // Pipeline events
  useWebSocketEvent('pipeline_started', (data) => {
    setPipelineStatus('running');
    setStartTime(data.start_time);
    setTotalIterations(data.config?.max_iterations || 3);
    setError(null);
  });

  useWebSocketEvent('pipeline_complete', (data) => {
    setPipelineStatus('complete');
    setMetrics(data.final_metrics);
    setProgress(100);
  });

  useWebSocketEvent('pipeline_error', (data) => {
    setPipelineStatus('error');
    setError(data.error);
  });

  useWebSocketEvent('pipeline_stopped', (data) => {
    setPipelineStatus('stopped');
  });

  // Problem analysis
  useWebSocketEvent('problem_analyzed', (data) => {
    setProblemStats(data.stats);
  });

  // Region events
  useWebSocketEvent('region_started', (data) => {
    setRegion(data.region_id, {
      id: data.region_id,
      name: data.region_id.charAt(0).toUpperCase() + data.region_id.slice(1),
      status: 'running',
      services_generated: 0,
      services_filtered: 0,
      services_selected: 0,
      weekly_profit: 0,
      coverage_percent: 0,
      operating_cost: 0,
      profit_margin_pct: 0,
      profit_per_service: 0,
      cost_per_service: 0,
      uncovered_teu: 0,
      hub_ports: [],
      strategy: '',
      explanation: '',
      color: getRegionColor(data.region_id)
    });
  });

  // Iteration events
  useWebSocketEvent('iteration_complete', (data) => {
    const iteration = {
      iteration: data.iteration,
      timestamp: new Date().toISOString(),
      weekly_profit: data.results.weekly_profit,
      coverage: data.results.coverage,
      convergence_score: data.convergence_score,
      needs_rerun: data.needs_rerun,
      rerun_reason: data.rerun_reason,
      weights_used: {}, // Would be populated with actual data
      regions: data.results.regions
    };

    addIteration(iteration);
    setCurrentIteration(data.iteration);
    setProgress(((data.iteration + 1) / data.max_iterations) * 100);

    // Update regions
    data.results.regions.forEach((region: any) => {
      setRegion(region.id, {
        ...region,
        color: getRegionColor(region.id)
      });
    });
  });

  // Map events
  useWebSocketEvent('map_update', (data) => {
    setCorridors(data.corridors);
    setActiveRoutes(data.new_routes || []);
  });

  // Stage progress
  useWebSocketEvent('stage_progress', (data) => {
    setStageProgress(data);
  });

  // ============================================================================
  // Connection Management
  // ============================================================================

  useEffect(() => {
    if (isConnected) {
      // Initial data fetch
      fetchInitialData();
    }
  }, [isConnected]);

  const fetchInitialData = async () => {
    try {
      // Fetch initial state via API
      const statusResponse = await apiClient.getStatus();
      if (statusResponse.success && statusResponse.data) {
        const state = statusResponse.data;
        setPipelineStatus(state.status);
        setCurrentIteration(state.current_iteration);
        setTotalIterations(state.total_iterations);
        setProblemStats(state.problem_stats || null);
        setMetrics(state.metrics || null);
        setRegions(state.regions || {});
        setCorridors(state.corridors || []);
        setStartTime(state.start_time || null);
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    }
  };

  // ============================================================================
  // Periodic Updates
  // ============================================================================

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date().toISOString());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // Cleanup
  // ============================================================================

  useEffect(() => {
    return () => {
      disconnect();
      resetPipeline();
    };
  }, [disconnect, resetPipeline]);

  return <>{children}</>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRegionColor(regionId: string): string {
  const colors: Record<string, string> = {
    asia: '#00d4ff',
    europe: '#7c3aed',
    americas: '#10b981',
    middle_east: '#f59e0b',
    africa: '#ef4444'
  };
  return colors[regionId] || '#6b7280';
}