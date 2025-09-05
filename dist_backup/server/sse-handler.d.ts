/**
 * Server-Sent Events (SSE) handler for real-time Node-RED monitoring
 */
import { Response } from 'express';
import { SSEConfig, SSEEventFilter, SSEStats, SSEEvent, SSESystemInfo, SSEClientInfo } from '../types/sse.js';
import { AuthRequest } from '../utils/auth.js';
export declare class SSEHandler {
    private connections;
    private config;
    private stats;
    private heartbeatInterval?;
    constructor(config?: Partial<SSEConfig>);
    /**
     * Handle new SSE connection
     */
    connect(req: AuthRequest, res: Response): string;
    /**
     * Disconnect SSE connection
     */
    disconnect(connectionId: string): void;
    /**
     * Subscribe connection to specific event types
     */
    subscribe(connectionId: string, eventTypes: string[]): void;
    /**
     * Unsubscribe connection from event types
     */
    unsubscribe(connectionId: string, eventTypes: string[]): void;
    /**
     * Send event to specific connection
     */
    sendToConnection(connectionId: string, event: SSEEvent): boolean;
    /**
     * Broadcast event to all subscribed connections
     */
    broadcast(event: SSEEvent, filter?: SSEEventFilter): number;
    /**
     * Send heartbeat to all connections
     */
    sendHeartbeat(): void;
    /**
     * Send system information
     */
    sendSystemInfo(systemInfo: Omit<SSESystemInfo['data'], 'memory' | 'uptime'>): void;
    /**
     * Send error event
     */
    sendError(error: string, connectionId?: string, source?: string): void;
    /**
     * Get current SSE statistics
     */
    getStats(): SSEStats;
    /**
     * Get connected clients information
     */
    getClients(): SSEClientInfo[];
    /**
     * Force disconnect specific connection
     */
    forceDisconnect(connectionId: string): boolean;
    /**
     * Clear all connections
     */
    clearAllConnections(): void;
    /**
     * Start heartbeat timer
     */
    private startHeartbeat;
    /**
     * Stop heartbeat timer
     */
    stopHeartbeat(): void;
    /**
     * Format event as SSE message
     */
    private formatSSEMessage;
    /**
     * Check if event matches filter criteria
     */
    private matchesFilter;
    /**
     * Clean up resources
     */
    destroy(): void;
}
//# sourceMappingURL=sse-handler.d.ts.map