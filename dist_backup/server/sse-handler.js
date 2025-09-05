/**
 * Server-Sent Events (SSE) handler for real-time Node-RED monitoring
 */
import { v4 as uuidv4 } from 'uuid';
import { SSEError as SSEErrorClass } from '../utils/error-handling.js';
export class SSEHandler {
    connections = new Map();
    config;
    stats;
    heartbeatInterval;
    constructor(config = {}) {
        this.config = {
            heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL || '30000'),
            maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS || '100'),
            retryTimeout: parseInt(process.env.SSE_RETRY_TIMEOUT || '5000'),
            compression: true,
            cors: {
                origin: process.env.CORS_ORIGIN || '*',
                credentials: process.env.CORS_CREDENTIALS === 'true',
            },
            ...config,
        };
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            messagesSent: 0,
            errors: 0,
            uptime: Date.now(),
            connectionsByEventType: {},
        };
        this.startHeartbeat();
    }
    /**
     * Handle new SSE connection
     */
    connect(req, res) {
        // Check connection limit
        if (this.connections.size >= this.config.maxConnections) {
            res.status(429).json({ error: 'Maximum connections reached' });
            throw new SSEErrorClass('Maximum connections reached');
        }
        const connectionId = uuidv4();
        const userAgent = req.get('User-Agent') || 'unknown';
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': this.config.cors.origin,
            'Access-Control-Allow-Credentials': this.config.cors.credentials.toString(),
            'Access-Control-Allow-Headers': 'Cache-Control',
        });
        // Create connection object
        const connection = {
            id: connectionId,
            response: res,
            userId: req.auth?.userId,
            clientInfo: {
                userAgent,
                ip,
                connectedAt: new Date(),
                lastActivity: new Date(),
            },
            subscriptions: new Set(),
            isAlive: true,
        };
        // Store connection
        this.connections.set(connectionId, connection);
        // Update stats
        this.stats.totalConnections++;
        this.stats.activeConnections++;
        // Handle client disconnect
        req.on('close', () => {
            this.disconnect(connectionId);
        });
        res.on('close', () => {
            this.disconnect(connectionId);
        });
        // Send initial connection event
        this.sendToConnection(connectionId, {
            type: 'connection-status',
            timestamp: new Date().toISOString(),
            data: {
                connectionId,
                status: 'connected',
                clientCount: this.connections.size,
            },
        });
        console.log(`SSE connection established: ${connectionId} (${ip})`);
        return connectionId;
    }
    /**
     * Disconnect SSE connection
     */
    disconnect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Clear heartbeat if exists
        if (connection.heartbeatInterval) {
            clearInterval(connection.heartbeatInterval);
        }
        // Close response if still open
        if (!connection.response.destroyed) {
            connection.response.end();
        }
        // Remove from connections
        this.connections.delete(connectionId);
        // Update stats
        this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
        console.log(`SSE connection closed: ${connectionId}`);
    }
    /**
     * Subscribe connection to specific event types
     */
    subscribe(connectionId, eventTypes) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new SSEErrorClass(`Connection ${connectionId} not found`, connectionId);
        }
        for (const eventType of eventTypes) {
            connection.subscriptions.add(eventType);
            // Update stats
            this.stats.connectionsByEventType[eventType] =
                (this.stats.connectionsByEventType[eventType] || 0) + 1;
        }
        connection.clientInfo.lastActivity = new Date();
    }
    /**
     * Unsubscribe connection from event types
     */
    unsubscribe(connectionId, eventTypes) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        for (const eventType of eventTypes) {
            connection.subscriptions.delete(eventType);
            // Update stats
            if (this.stats.connectionsByEventType[eventType]) {
                this.stats.connectionsByEventType[eventType]--;
                if (this.stats.connectionsByEventType[eventType] <= 0) {
                    delete this.stats.connectionsByEventType[eventType];
                }
            }
        }
        connection.clientInfo.lastActivity = new Date();
    }
    /**
     * Send event to specific connection
     */
    sendToConnection(connectionId, event) {
        const connection = this.connections.get(connectionId);
        if (!connection || !connection.isAlive) {
            return false;
        }
        try {
            const message = this.formatSSEMessage(event);
            connection.response.write(message);
            connection.clientInfo.lastActivity = new Date();
            this.stats.messagesSent++;
            return true;
        }
        catch (error) {
            console.error(`Failed to send SSE message to ${connectionId}:`, error);
            this.stats.errors++;
            this.disconnect(connectionId);
            return false;
        }
    }
    /**
     * Broadcast event to all subscribed connections
     */
    broadcast(event, filter) {
        let sentCount = 0;
        for (const [connectionId, connection] of this.connections) {
            // Check if connection is subscribed to this event type
            if (!connection.subscriptions.has(event.type) &&
                !connection.subscriptions.has('*')) {
                continue;
            }
            // Apply filters
            if (filter && !this.matchesFilter(event, filter, connection)) {
                continue;
            }
            if (this.sendToConnection(connectionId, event)) {
                sentCount++;
            }
        }
        return sentCount;
    }
    /**
     * Send heartbeat to all connections
     */
    sendHeartbeat() {
        const heartbeat = {
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            serverTime: Date.now(),
            connections: this.connections.size,
        };
        // Send to connections subscribed to heartbeat
        for (const [connectionId, connection] of this.connections) {
            if (connection.subscriptions.has('heartbeat') ||
                connection.subscriptions.has('*')) {
                this.sendToConnection(connectionId, heartbeat);
            }
        }
    }
    /**
     * Send system information
     */
    sendSystemInfo(systemInfo) {
        const memoryUsage = process.memoryUsage();
        const event = {
            type: 'system-info',
            timestamp: new Date().toISOString(),
            data: {
                memory: {
                    used: memoryUsage.heapUsed,
                    total: memoryUsage.heapTotal,
                    percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
                },
                uptime: Date.now() - this.stats.uptime,
                ...systemInfo,
            },
        };
        this.broadcast(event);
    }
    /**
     * Send error event
     */
    sendError(error, connectionId, source) {
        const errorEvent = {
            type: 'error',
            timestamp: new Date().toISOString(),
            data: {
                error,
                source,
                connectionId,
            },
        };
        if (connectionId) {
            this.sendToConnection(connectionId, errorEvent);
        }
        else {
            this.broadcast(errorEvent);
        }
        this.stats.errors++;
    }
    /**
     * Get current SSE statistics
     */
    getStats() {
        return {
            ...this.stats,
            uptime: Date.now() - this.stats.uptime,
            activeConnections: this.connections.size,
        };
    }
    /**
     * Get connected clients information
     */
    getClients() {
        return Array.from(this.connections.values()).map((conn) => ({
            connectionId: conn.id,
            userId: conn.userId,
            connectedAt: conn.clientInfo.connectedAt,
            subscriptions: Array.from(conn.subscriptions),
            messageCount: 0, // Could be tracked if needed
            lastActivity: conn.clientInfo.lastActivity,
            isAlive: conn.isAlive,
        }));
    }
    /**
     * Force disconnect specific connection
     */
    forceDisconnect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return false;
        this.disconnect(connectionId);
        return true;
    }
    /**
     * Clear all connections
     */
    clearAllConnections() {
        const connectionIds = Array.from(this.connections.keys());
        for (const connectionId of connectionIds) {
            this.disconnect(connectionId);
        }
    }
    /**
     * Start heartbeat timer
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatInterval);
    }
    /**
     * Stop heartbeat timer
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
    }
    /**
     * Format event as SSE message
     */
    formatSSEMessage(event) {
        const message = {
            id: uuidv4(),
            event: event.type,
            data: JSON.stringify(event),
            retry: this.config.retryTimeout,
        };
        let formatted = '';
        if (message.id)
            formatted += `id: ${message.id}\n`;
        if (message.event)
            formatted += `event: ${message.event}\n`;
        if (message.retry)
            formatted += `retry: ${message.retry}\n`;
        formatted += `data: ${message.data}\n\n`;
        return formatted;
    }
    /**
     * Check if event matches filter criteria
     */
    matchesFilter(event, filter, connection) {
        // Filter by user ID
        if (filter.userId && connection.userId !== filter.userId) {
            return false;
        }
        // Filter by event types
        if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
            return false;
        }
        // For Node-RED events, check additional filters
        if ('data' in event && typeof event.data === 'object') {
            const eventData = event.data;
            // Filter by node IDs
            if (filter.nodeIds &&
                eventData.id &&
                !filter.nodeIds.includes(eventData.id)) {
                return false;
            }
            // Filter by flow IDs
            if (filter.flowIds &&
                eventData.flowId &&
                !filter.flowIds.includes(eventData.flowId)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Clean up resources
     */
    destroy() {
        this.stopHeartbeat();
        this.clearAllConnections();
    }
}
//# sourceMappingURL=sse-handler.js.map