/**
 * Production API client — single HTTP layer for backend communication.
 */

import { RUNTIME_TRUTH_URL, normalizeRuntime } from '../runtime/runtimeAdapter.js';

const API_BASE_URL = '/api';

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async get(endpoint) {
    return this.request(endpoint);
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPipelineStatus() {
    return this.get('/pipeline/status');
  }

  async startPipeline(config) {
    return this.post('/pipeline/start', config);
  }

  async stopPipeline() {
    return this.post('/pipeline/stop');
  }

  async getMetrics() {
    return this.get('/metrics/summary');
  }

  async getRegions() {
    return this.get('/regions/');
  }

  async healthCheck() {
    return this.get('/health');
  }

  async loadRuntimeTruth() {
    const response = await fetch(RUNTIME_TRUTH_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const runtime = await response.json();
    return normalizeRuntime(runtime);
  }
}

export const apiClient = new ApiClient();
export { ApiClient };
