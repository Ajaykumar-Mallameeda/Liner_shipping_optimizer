/**
 * WebSocket client for real-time updates
 */

export class WebSocketClient {
  constructor(url = 'ws://localhost:8000/ws/pipeline') {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 5000;
    this.isConnecting = false;
    this.listeners = new Map();
    this.connectionPromise = null;
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.emit('disconnected');

          // Attempt reconnection if not explicitly closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++;
              console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
              this.connect();
            }, this.reconnectInterval);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emit('error', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
  }

  /**
   * Send message to server
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(events) {
    this.send({
      type: 'subscribe',
      events: Array.isArray(events) ? events : [events]
    });
  }

  /**
   * Start pipeline optimization
   */
  startPipeline(config = {}) {
    this.send({
      type: 'start_pipeline',
      config
    });
  }

  /**
   * Send ping to server
   */
  ping() {
    this.send({ type: 'ping' });
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket event listener:', error);
        }
      });
    }
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    const { type, data, timestamp } = message;

    // Emit specific event type
    this.emit(type, data);

    // Emit generic message event
    this.emit('message', message);

    // Handle specific message types
    switch (type) {
      case 'pipeline_started':
        this.emit('pipeline-status', 'running');
        break;
      case 'pipeline_completed':
        this.emit('pipeline-status', 'completed');
        break;
      case 'pipeline_stopped':
        this.emit('pipeline-status', 'stopped');
        break;
      case 'pipeline_error':
        this.emit('pipeline-status', 'error');
        break;
      case 'stage_started':
        this.emit('stage-progress', { stage: data.stage, status: 'running', progress: 0 });
        break;
      case 'stage_completed':
        this.emit('stage-progress', { stage: data.stage, status: 'completed', progress: 100 });
        break;
      case 'stage_progress':
        this.emit('stage-progress', { stage: data.stage, progress: data.progress });
        break;
      case 'region_update':
        this.emit('region-data', data);
        break;
      case 'iteration_update':
        this.emit('iteration-data', data);
        break;
      case 'metrics_update':
        this.emit('metrics-data', data);
        break;
      case 'map_update':
        this.emit('map-data', data);
        break;
    }
  }

  /**
   * Get connection status
   */
  get status() {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}

