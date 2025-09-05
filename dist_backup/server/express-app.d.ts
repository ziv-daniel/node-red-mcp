/**
 * Express application setup for HTTP transport and SSE endpoints
 */
import express from 'express';
import { McpNodeRedServer } from './mcp-server.js';
export interface ExpressAppConfig {
    port: number;
    host: string;
    cors: {
        origin: string | string[];
        credentials: boolean;
    };
    rateLimit: {
        windowMs: number;
        max: number;
    };
    helmet: boolean;
}
export declare class ExpressApp {
    private app;
    private mcpServer;
    private sseHandler;
    private config;
    constructor(mcpServer: McpNodeRedServer, config?: Partial<ExpressAppConfig>);
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup API routes
     */
    private setupRoutes;
    /**
     * Setup error handling middleware
     */
    private setupErrorHandling;
    /**
     * Start the Express server
     */
    start(): Promise<void>;
    /**
     * Get Express app instance
     */
    getApp(): express.Application;
    /**
     * Send system information via SSE
     */
    sendSystemInfo(): void;
    /**
     * Start system monitoring (send periodic updates via SSE)
     */
    startSystemMonitoring(intervalMs?: number): void;
}
//# sourceMappingURL=express-app.d.ts.map