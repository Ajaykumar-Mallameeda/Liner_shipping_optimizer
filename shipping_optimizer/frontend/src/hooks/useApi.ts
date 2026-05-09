/**
 * React hooks for API interactions
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/apiClient';
import { ApiResponse, PipelineState, ProblemStats, RegionData, GlobalMetrics, IterationData, MapCorridor } from '../api/types';

// ============================================================================
// Generic API Hook
// ============================================================================

export function useApi<T>(
  fetcher: () => Promise<ApiResponse<T>>,
  deps: any[] = []
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetcher();

      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================================
// Specific API Hooks
// ============================================================================

export function usePipelineState() {
  return useApi<PipelineState>(
    () => apiClient.getStatus(),
    []
  );
}

export function useProblemStats() {
  return useApi<ProblemStats>(
    () => apiClient.getProblemStats(),
    []
  );
}

export function useRegions() {
  return useApi<RegionData[]>(
    () => apiClient.getRegions(),
    []
  );
}

export function useMetrics() {
  return useApi<GlobalMetrics>(
    () => apiClient.getMetrics(),
    []
  );
}

export function useIterations() {
  return useApi<IterationData[]>(
    () => apiClient.getIterations(),
    []
  );
}

export function useCorridors() {
  return useApi<MapCorridor[]>(
    () => apiClient.getCorridors(),
    []
  );
}

export function useHealth() {
  return useApi<{ status: string; connected_clients: number }>(
    () => apiClient.getHealth(),
    []
  );
}

// ============================================================================
// Action Hooks
// ============================================================================

export function useStartPipeline() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPipeline = useCallback(async (config?: any) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.startPipeline(config);

      if (!response.success) {
        setError(response.error || 'Failed to start pipeline');
      }

      return response.success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { startPipeline, loading, error };
}

export function useTriggerOptimization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerOptimization = useCallback(async (config?: any) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.triggerOptimization(config);

      if (!response.success) {
        setError(response.error || 'Failed to trigger optimization');
      }

      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { triggerOptimization, loading, error };
}

export function useExportResults() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.exportResults();

      if (!response.success) {
        setError(response.error || 'Failed to export results');
        return null;
      }

      // Download the results as JSON
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maritime-optimization-results-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportResults, loading, error };
}