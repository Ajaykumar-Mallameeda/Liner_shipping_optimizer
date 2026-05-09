/**
 * WebSocket Service for Real-Time Dashboard Updates
 * Handles connection management, event subscription, and state synchronization
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.eventHandlers = new Map();
    this.messageQueue = [];
    this.heartbeatInterval = null;
  }

  /**
   * Connect to WebSocket server
   * @param {string} url - WebSocket endpoint URL
   * @param {Object} options - Connection options
   */
  connect(url = 'ws://localhost:8000/ws/pipeline', options = {}) {
    this.url = url;
    this.options = {
      autoReconnect: true,
      heartbeatInterval: 30000,
      ...options
    };

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Send queued messages
          this.flushQueue();

          // Start heartbeat
          this.startHeartbeat();

          // Send subscription request for all events
          this.send({
            type: 'subscribe',
            events: [
              'pipeline_started',
              'stage_started',
              'stage_progress',
              'stage_completed',
              'region_updated',
              'iteration_started',
              'iteration_completed',
              'convergence_reached',
              'map_updated',
              'pipeline_completed',
              'pipeline_error'
            ]
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.isConnected = false;
          this.stopHeartbeat();

          // Auto reconnect if enabled
          if (this.options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
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

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.options.autoReconnect = false;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.eventHandlers.clear();
    this.messageQueue = [];
  }

  /**
   * Send message to WebSocket server
   * @param {Object} message - Message to send
   */
  send(message) {
    const messageStr = JSON.stringify({
      ...message,
      timestamp: new Date().toISOString()
    });

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(messageStr);
    } else {
      // Queue message if not connected
      this.messageQueue.push(messageStr);
    }
  }

  /**
   * Subscribe to specific event type
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Event handler function
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType).add(handler);
  }

  /**
   * Unsubscribe from event type
   * @param {string} eventType - Event type to unsubscribe from
   * @param {Function} handler - Event handler function (optional)
   */
  off(eventType, handler = null) {
    if (handler) {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    } else {
      this.eventHandlers.delete(eventType);
    }
  }

  /**
   * Start optimization pipeline
   * @param {Object} config - Pipeline configuration
   */
  startPipeline(config = {}) {
    this.send({
      type: 'start_pipeline',
      config: {
        max_iterations: 3,
        dataset_path: 'data/liner_shipping_dataset.csv',
        ...config
      }
    });
  }

  /**
   * Send ping to server
   */
  ping() {
    this.send({ type: 'ping' });
  }

  /**
   * Handle incoming WebSocket message
   * @param {Object} data - Parsed message data
   */
  handleMessage(data) {
    // Handle specific message types
    switch (data.type) {
      case 'pong':
        // Update last ping time
        break;
      case 'connected':
        console.log('Connected to shipping optimizer WebSocket');
        break;
      case 'pipeline_error':
        console.error('Pipeline error:', data);
        break;
    }

    // Notify all handlers for this event type
    const handlers = this.eventHandlers.get(data.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${data.type}:`, error);
        }
      });
    }
  }

  /**
   * Flush queued messages
   */
  flushQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.ws.send(message);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (!this.isConnected && this.options.autoReconnect) {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect(this.url, this.options).catch(() => {
          // Connection failed, will try again
        });
      }
    }, delay);
  }

  /**
   * Start heartbeat ping interval
   */
  startHeartbeat() {
    if (this.options.heartbeatInterval > 0) {
      this.heartbeatInterval = setInterval(() => {
        this.ping();
      }, this.options.heartbeatInterval);
    }
  }

  /**
   * Stop heartbeat ping interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connection status
   * @returns {boolean} True if connected
   */
  isReady() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;