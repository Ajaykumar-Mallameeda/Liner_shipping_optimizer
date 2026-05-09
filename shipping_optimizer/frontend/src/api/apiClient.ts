/**
 * API Client for Maritime Dashboard
 * Handles HTTP requests and WebSocket connections
 */

import { ApiConfig, ApiResponse } from './types';
import { PipelineState, RegionData, GlobalMetrics, IterationData, MapCorridor, ProblemStats } from '../types';

class ApiClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private wsCallbacks: Map<string, (data: any) => void> = new Map();
  private wsReconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(config?: Partial<ApiConfig>) {
    this.baseUrl = config?.baseUrl || 'http://localhost:8000';
    this.wsUrl = config?.wsUrl || 'ws://localhost:8000/ws';
  }

  // ============================================================================
  // HTTP API Methods
  // ============================================================================

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================================
  // Specific API Endpoints
  // ============================================================================

  async getHealth(): Promise<ApiResponse<{ status: string; connected_clients: number }>> {
    return this.get('/api/health');
  }

  async getStatus(): Promise<ApiResponse<PipelineState>> {
    return this.get('/api/status');
  }

  async getProblemStats(): Promise<ApiResponse<ProblemStats>> {
    return this.get('/api/problem-stats');
  }

  async getRegions(): Promise<ApiResponse<RegionData[]>> {
    return this.get('/api/regions');
  }

  async getMetrics(): Promise<ApiResponse<GlobalMetrics>> {
    return this.get('/api/metrics');
  }

  async getIterations(): Promise<ApiResponse<IterationData[]>> {
    return this.get('/api/iterations');
  }

  async getCorridors(): Promise<ApiResponse<MapCorridor[]>> {
    return this.get('/api/corridors');
  }

  async exportResults(): Promise<ApiResponse<any>> {
    return this.get('/api/export');
  }

  async startPipeline(config?: any): Promise<ApiResponse<any>> {
    return this.post('/api/optimize', { dataset: 'data/datasets/large_shipping_problem.json', ...config });
  }

  async triggerOptimization(config?: any): Promise<ApiResponse<any>> {
    return this.post('/api/optimize', config);
  }

  // ============================================================================
  // WebSocket Methods
  // ============================================================================

  connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.wsReconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.handleWebSocketClose();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendWebSocketMessage(type: string, data?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  // ============================================================================
  // WebSocket Event Handlers
  // ============================================================================

  onWebSocketEvent(type: string, callback: (data: any) => void) {
    this.wsCallbacks.set(type, callback);
  }

  offWebSocketEvent(type: string) {
    this.wsCallbacks.delete(type);
  }

  private handleWebSocketMessage(message: any) {
    const { type, data } = message;
    const callback = this.wsCallbacks.get(type);

    if (callback) {
      callback(data);
    }

    // Handle common message types
    switch (type) {
      case 'initial_state':
        this.wsCallbacks.get('state')?.(data);
        break;
      case 'pipeline_started':
        this.wsCallbacks.get('pipelineStarted')?.(data);
        break;
      case 'pipeline_complete':
        this.wsCallbacks.get('pipelineComplete')?.(data);
        break;
      case 'pipeline_error':
        this.wsCallbacks.get('pipelineError')?.(data);
        break;
      case 'problem_analyzed':
        this.wsCallbacks.get('problemAnalyzed')?.(data);
        break;
      case 'region_started':
        this.wsCallbacks.get('regionStarted')?.(data);
        break;
      case 'iteration_complete':
        this.wsCallbacks.get('iterationComplete')?.(data);
        break;
      case 'map_update':
        this.wsCallbacks.get('mapUpdate')?.(data);
        break;
      case 'stage_progress':
        this.wsCallbacks.get('stageProgress')?.(data);
        break;
    }
  }

  private handleWebSocketClose() {
    this.wsCallbacks.get('disconnected')?.({});

    // Attempt reconnection
    if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.wsReconnectAttempts++;
        console.log(`WebSocket reconnection attempt ${this.wsReconnectAttempts}`);
        this.connectWebSocket().catch(error => {
          console.error('WebSocket reconnection failed:', error);
        });
      }, this.reconnectDelay * Math.pow(2, this.wsReconnectAttempts));
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  setBaseUrl(url: string) {
    this.baseUrl = url;
    this.wsUrl = url.replace('http', 'ws') + '/ws';
  }

  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export class for testing or multiple instances
export { ApiClient };