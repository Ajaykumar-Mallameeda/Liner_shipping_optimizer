/**
 * API client for HTTP requests to backend
 */

const API_BASE_URL = 'http://localhost:8000/api';

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

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // GET requests
  async get(endpoint) {
    return this.request(endpoint);
  }

  // POST requests
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT requests
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE requests
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }

  // Pipeline endpoints
  async getPipelineStatus() {
    return this.get('/pipeline/status');
  }

  async startPipeline(config) {
    return this.post('/pipeline/start', config);
  }

  async stopPipeline() {
    return this.post('/pipeline/stop');
  }

  async getIterations() {
    return this.get('/pipeline/iterations');
  }

  async getStages() {
    return this.get('/pipeline/stages');
  }

  async getConflicts() {
    return this.get('/pipeline/conflicts');
  }

  // Metrics endpoints
  async getMetrics() {
    return this.get('/metrics/summary');
  }

  async getProfitTrends() {
    return this.get('/metrics/profit-trends');
  }

  async getCoverageMetrics() {
    return this.get('/metrics/coverage-metrics');
  }

  async getServiceStats() {
    return this.get('/metrics/service-stats');
  }

  // Regions endpoints
  async getRegions() {
    return this.get('/regions/');
  }

  async getRegion(regionId) {
    return this.get(`/regions/${regionId}`);
  }

  async getRegionServices(regionId) {
    return this.get(`/regions/${regionId}/services`);
  }

  async getRegionHubs(regionId) {
    return this.get(`/regions/${regionId}/hubs`);
  }

  // Health check
  async healthCheck() {
    return this.get('/health');
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export class for custom instances if needed
export { ApiClient };