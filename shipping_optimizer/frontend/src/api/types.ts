/**
 * Type definitions for API responses and requests
 */

export interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Pipeline State Types
// ============================================================================

export interface PipelineState {
  status: 'idle' | 'running' | 'complete' | 'error' | 'stopped';
  start_time?: string;
  end_time?: string;
  current_iteration: number;
  total_iterations: number;
  runtime_seconds?: number;
  progress_percent: number;
  config?: any;
  problem_stats?: ProblemStats;
  metrics?: GlobalMetrics;
  regions?: Record<string, RegionData>;
  iterations?: IterationData[];
  corridors?: MapCorridor[];
  error?: string;
}

export interface ProblemStats {
  ports: number;
  lanes: number;
  services: number;
  weekly_demand: number;
  avg_demand_per_lane: number;
  network_density: number;
}

export interface RegionData {
  id: string;
  name: string;
  status: string;
  services_generated: number;
  services_filtered: number;
  services_selected: number;
  weekly_profit: number;
  coverage_percent: number;
  operating_cost: number;
  profit_margin_pct: number;
  profit_per_service: number;
  cost_per_service: number;
  uncovered_teu: number;
  hub_ports: number[];
  strategy: string;
  explanation: string;
  color: string;
}

export interface GlobalMetrics {
  weekly_profit: number;
  annual_profit: number;
  operating_cost: number;
  transship_cost: number;
  port_cost: number;
  total_cost: number;
  cost: number;
  total_services: number;
  satisfied_demand: number;
  unserved_demand: number;
  coverage: number;
  profit_margin_pct: number;
  profit_per_service: number;
  cost_per_service: number;
  uncovered_pct: number;
}

export interface IterationData {
  iteration: number;
  timestamp: string;
  weekly_profit: number;
  coverage: number;
  convergence_score: number;
  needs_rerun: boolean;
  rerun_reason: string;
  weights_used: Record<string, number>;
  regions: RegionData[];
}

export interface MapCorridor {
  from_port: string;
  to_port: string;
  teu: number;
  region: string;
  color: string;
  active: boolean;
}

export interface MapUpdate {
  iteration: number;
  corridors: MapCorridor[];
  new_routes: MapCorridor[];
  removed_routes: MapCorridor[];
}

// ============================================================================
// Event Types
// ============================================================================

export interface StageProgress {
  stage: string;
  iteration: number;
  message: string;
  progress: number;
}

export interface PipelineEvent {
  type: string;
  timestamp: string;
  data: any;
}

// ============================================================================
// Request Types
// ============================================================================

export interface OptimizationConfig {
  dataset: string;
  max_iterations: number;
  target_coverage: number;
  target_profit_margin: number;
  region_count: number;
  ga_config: Record<string, any>;
  milp_config: Record<string, any>;
}

export interface StartPipelineRequest {
  config: OptimizationConfig;
}

export interface StopPipelineRequest {
  reason?: string;
}

export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx';
  include_iterations: boolean;
  include_raw_data: boolean;
}