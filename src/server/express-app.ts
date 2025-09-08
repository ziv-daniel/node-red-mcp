/**
 * Express application setup for HTTP transport and SSE endpoints
 */

import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { NodeRedEventListener } from '../services/nodered-event-listener.js';
import type { ApiResponse } from '../types/mcp-extensions.js';
import { authenticate, authenticateClaudeCompatible, getRateLimitKey } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import {
  errorHandler,
  requestIdMiddleware,
  asyncHandler,
  ValidationError,
} from '../utils/error-handling.js';

import { McpNodeRedServer } from './mcp-server.js';
import { SSEHandler } from './sse-handler.js';

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

export class ExpressApp {
  private app: express.Application;
  private mcpServer: McpNodeRedServer;
  private sseHandler: SSEHandler;
  private eventListener: NodeRedEventListener;
  private config: ExpressAppConfig;

  constructor(mcpServer: McpNodeRedServer, config: Partial<ExpressAppConfig> = {}) {
    this.mcpServer = mcpServer;
    this.sseHandler = mcpServer.getSSEHandler();
    this.eventListener = new NodeRedEventListener(this.sseHandler, mcpServer.getNodeRedClient());

    this.config = {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || 'localhost',
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: process.env.CORS_CREDENTIALS === 'true',
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      },
      helmet: process.env.NODE_ENV === 'production',
      ...config,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Request ID middleware
    this.app.use(requestIdMiddleware);

    // Security middleware
    if (this.config.helmet) {
      this.app.use(
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
            },
          },
        })
      );
    }

    // CORS middleware with Claude compatibility
    this.app.use(
      cors({
        origin: (origin, callback) => {
          const isClaudeMode = process.env.CLAUDE_COMPATIBLE_MODE === 'true';
          const debugConnections = process.env.DEBUG_CLAUDE_CONNECTIONS === 'true';

          if (debugConnections) {
            console.log('CORS origin check:', { origin, claudeMode: isClaudeMode });
          }

          // Allow Claude.ai domains and configured origins
          const allowedOrigins = [
            'https://claude.ai',
            'https://www.claude.ai',
            'https://app.claude.ai',
            this.config.cors.origin,
          ].filter(Boolean);

          // In Claude mode, be more permissive
          if (isClaudeMode) {
            if (!origin || allowedOrigins.includes(origin) || origin.includes('claude')) {
              callback(null, true);
              return;
            }
          }

          // Standard origin check
          if (!origin || this.config.cors.origin === '*' || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: this.config.cors.credentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-API-Key',
          'Cache-Control',
          'X-Requested-With',
          'Accept',
          'Origin',
          'Mcp-Session-Id',
        ],
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000),
      },
      keyGenerator: getRateLimitKey,
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint (public)
    this.app.get(
      '/health',
      asyncHandler(async (req: Request, res: Response) => {
        const health = await this.mcpServer.getNodeRedClient().healthCheck();
        const sseStats = this.sseHandler.getStats();

        const response: ApiResponse = {
          success: true,
          data: {
            server: 'healthy',
            nodeRed: health,
            sse: {
              activeConnections: sseStats.activeConnections,
              totalConnections: sseStats.totalConnections,
              uptime: sseStats.uptime,
            },
            memory: process.memoryUsage(),
            uptime: process.uptime(),
          },
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // Simple ping endpoint for Claude website
    this.app.get('/ping', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'MCP Node-RED Server',
      });
    });

    // MCP initialization endpoint
    this.app.post(
      '/api/mcp/initialize',
      asyncHandler(async (req: Request, res: Response) => {
        const { jsonrpc = '2.0', id = 1 } = req.body;

        try {
          const tools = await this.mcpServer.listTools();
          const resources = await this.mcpServer.listResources();
          const prompts = await this.mcpServer.listPrompts();

          const response = {
            jsonrpc,
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
                logging: {},
              },
              serverInfo: {
                name: 'nodered-mcp-server',
                version: '1.0.0',
              },
              tools: tools.tools || [],
              resources: resources.resources || [],
              prompts: prompts.prompts || [],
            },
          };

          res.json(response);
        } catch (error) {
          console.error('MCP initialization failed:', error);
          res.status(500).json({
            jsonrpc,
            id,
            error: {
              code: -32603,
              message: 'Internal error during initialization',
              data: error instanceof Error ? error.message : String(error),
            },
          });
        }
      })
    );

    // API info endpoint
    this.app.get('/api/info', (req: Request, res: Response) => {
      const response: ApiResponse = {
        success: true,
        data: {
          name: 'MCP Node-RED Server',
          version: '1.0.0',
          description: 'Model Context Protocol server for Node-RED integration',
          capabilities: {
            tools: true,
            resources: true,
            prompts: true,
            sse: true,
          },
        },
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    });

    // Add CORS preflight handler for Claude integration
    this.app.options('/sse', (req: Request, res: Response) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Cache-Control, X-Requested-With, X-API-Key'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(200).end();
    });

    // Claude website expects /sse endpoint (standard MCP SSE format)
    this.app.get(
      '/sse',
      authenticateClaudeCompatible,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        try {
          const debugConnections = process.env.DEBUG_CLAUDE_CONNECTIONS === 'true';

          if (debugConnections) {
            console.log('Claude SSE connection established:', {
              userAgent: req.get('User-Agent'),
              origin: req.get('Origin'),
              authenticated: req.auth?.isAuthenticated || false,
              userId: req.auth?.userId,
            });
          }

          // Set proper SSE headers for MCP with Claude compatibility
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers':
              'Authorization, Content-Type, Cache-Control, X-Requested-With, X-API-Key',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'X-MCP-Server': 'nodered-mcp-server',
            'X-MCP-Version': '1.0.0',
            'X-MCP-Protocol': '2024-11-05',
          });

          console.log(`MCP SSE client connected (Claude ${req.auth?.userId || 'unknown'})`);

          // Send initial MCP server capabilities immediately
          const serverInfo = {
            jsonrpc: '2.0',
            method: 'server/info',
            params: {
              name: 'nodered-mcp-server',
              version: '1.0.0',
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
                logging: {},
              },
            },
          };

          // Send server info as initial SSE event
          res.write(`event: server-info\n`);
          res.write(`data: ${JSON.stringify(serverInfo)}\n\n`);

          // Send available tools list
          try {
            const tools = await this.mcpServer.listTools();
            const toolsEvent = {
              jsonrpc: '2.0',
              method: 'tools/list',
              result: tools,
            };
            res.write(`event: tools-list\n`);
            res.write(`data: ${JSON.stringify(toolsEvent)}\n\n`);
          } catch (error) {
            console.error('Failed to get tools list:', error);
          }

          // Send connection status
          res.write(`event: connection-status\n`);
          res.write(
            `data: {"status": "connected", "timestamp": "${new Date().toISOString()}"}\n\n`
          );

          // Keep connection alive with periodic heartbeat
          const heartbeatInterval = setInterval(() => {
            try {
              res.write(`event: heartbeat\n`);
              res.write(`data: {"timestamp": "${new Date().toISOString()}"}\n\n`);
            } catch (error) {
              clearInterval(heartbeatInterval);
            }
          }, 30000);

          // Handle client disconnect
          req.on('close', () => {
            clearInterval(heartbeatInterval);
            console.log('MCP SSE client disconnected');
          });

          res.on('close', () => {
            clearInterval(heartbeatInterval);
          });

          res.on('error', () => {
            clearInterval(heartbeatInterval);
          });

          // Keep connection open for SSE
          return;
        } catch (error) {
          const debugConnections = process.env.DEBUG_CLAUDE_CONNECTIONS === 'true';

          if (debugConnections) {
            console.error('MCP SSE connection failed:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              userAgent: req.get('User-Agent'),
              origin: req.get('Origin'),
            });
          } else {
            console.error('MCP SSE connection failed:', error);
          }

          if (!res.headersSent) {
            res.status(500).json({
              error: 'Failed to establish MCP SSE connection',
              details: debugConnections
                ? error instanceof Error
                  ? error.message
                  : String(error)
                : undefined,
              hint: 'Enable DEBUG_CLAUDE_CONNECTIONS=true for more details',
            });
          }
        }
      })
    );

    // MCP JSON-RPC endpoint for Claude website (standard MCP format)
    this.app.post(
      '/messages',
      asyncHandler(async (req: Request, res: Response) => {
        try {
          console.log('Received MCP JSON-RPC request:', JSON.stringify(req.body, null, 2));

          const { method, params, id, jsonrpc } = req.body;

          // Validate JSON-RPC 2.0 format
          if (jsonrpc !== '2.0') {
            return res.status(400).json({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32600,
                message: 'Invalid Request - jsonrpc must be 2.0',
              },
            });
          }

          let result;
          switch (method) {
            case 'initialize':
              result = {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {},
                  logging: {},
                },
                serverInfo: {
                  name: 'nodered-mcp-server',
                  version: '1.0.0',
                },
              };
              break;

            case 'tools/list':
              result = await this.mcpServer.listTools();
              break;

            case 'tools/call':
              if (!params?.name) {
                throw new Error('Tool name is required');
              }
              result = await this.mcpServer.callToolPublic(params.name, params.arguments || {});
              break;

            case 'resources/list':
              result = await this.mcpServer.listResources();
              break;

            case 'resources/read':
              if (!params?.uri) {
                throw new Error('Resource URI is required');
              }
              result = await this.mcpServer.readResource(params.uri);
              break;

            case 'prompts/list':
              result = await this.mcpServer.listPrompts();
              break;

            case 'prompts/get':
              if (!params?.name) {
                throw new Error('Prompt name is required');
              }
              result = await this.mcpServer.getPromptPublic(params.name, params.arguments || {});
              break;

            default:
              throw new Error(`Unknown method: ${method}`);
          }

          const response = {
            jsonrpc: '2.0',
            id,
            result,
          };

          console.log('Sending MCP JSON-RPC response:', JSON.stringify(response, null, 2));
          return res.json(response);
        } catch (error) {
          const errorResponse = {
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error',
            },
          };
          console.error('MCP JSON-RPC error:', errorResponse);
          return res.status(500).json(errorResponse);
        }
      })
    );

    // MCP JSON-RPC endpoint for tool calls (POST requests) - legacy endpoint
    this.app.post(
      '/api/events',
      asyncHandler(async (req: Request, res: Response) => {
        try {
          const { method, params, id, jsonrpc } = req.body;

          // Validate JSON-RPC 2.0 format
          if (jsonrpc !== '2.0') {
            return res.status(400).json({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32600,
                message: 'Invalid Request - jsonrpc must be 2.0',
              },
            });
          }

          let result;
          switch (method) {
            case 'initialize':
              result = {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {},
                  logging: {},
                },
                serverInfo: {
                  name: 'nodered-mcp-server',
                  version: '1.0.0',
                },
              };
              break;

            case 'tools/list':
              result = await this.mcpServer.listTools();
              break;

            case 'tools/call':
              if (!params?.name) {
                throw new Error('Tool name is required');
              }
              result = await this.mcpServer.callToolPublic(params.name, params.arguments || {});
              break;

            case 'resources/list':
              result = await this.mcpServer.listResources();
              break;

            case 'resources/read':
              if (!params?.uri) {
                throw new Error('Resource URI is required');
              }
              result = await this.mcpServer.readResource(params.uri);
              break;

            case 'prompts/list':
              result = await this.mcpServer.listPrompts();
              break;

            case 'prompts/get':
              if (!params?.name) {
                throw new Error('Prompt name is required');
              }
              result = await this.mcpServer.getPromptPublic(params.name, params.arguments || {});
              break;

            default:
              throw new Error(`Unknown method: ${method}`);
          }

          const response = {
            jsonrpc: '2.0',
            id,
            result,
          };

          return res.json(response);
        } catch (error) {
          const errorResponse = {
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error',
            },
          };
          return res.status(500).json(errorResponse);
        }
      })
    );

    // Authenticated SSE connection endpoint (for secure access)
    this.app.get(
      '/api/events/secure',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        try {
          const connectionId = this.sseHandler.connect(req, res);

          // Subscribe to default events
          const defaultSubscriptions = ['heartbeat', 'system-info', 'connection-status'];
          this.sseHandler.subscribe(connectionId, defaultSubscriptions);

          console.log(`SSE client connected: ${connectionId} (authenticated)`);

          // Keep connection open for SSE
          return;
        } catch (error) {
          console.error('SSE connection failed:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to establish SSE connection' });
          }
        }
      })
    );

    // SSE subscription management
    this.app.post(
      '/api/events/subscribe',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const { connectionId, eventTypes } = req.body;

        if (!connectionId || !Array.isArray(eventTypes)) {
          throw new ValidationError('connectionId and eventTypes array are required');
        }

        this.sseHandler.subscribe(connectionId, eventTypes);

        const response: ApiResponse = {
          success: true,
          data: { message: 'Subscribed successfully', eventTypes },
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // Advanced subscription management with filters
    this.app.post(
      '/api/events/subscribe/filtered',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const { connectionId, eventType, filter } = req.body;

        if (!connectionId || !eventType) {
          throw new ValidationError('connectionId and eventType are required');
        }

        this.sseHandler.subscribeWithFilter(connectionId, eventType, filter);

        const response: ApiResponse = {
          success: true,
          data: { message: 'Subscribed with filter successfully', eventType, filter },
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // Get subscription details
    this.app.get(
      '/api/events/subscriptions/:connectionId',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const { connectionId } = req.params;

        if (!connectionId) {
          throw new ValidationError('Connection ID is required');
        }

        const subscriptions = this.sseHandler.getSubscriptions(connectionId);

        const response: ApiResponse = {
          success: true,
          data: subscriptions,
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    this.app.post(
      '/api/events/unsubscribe',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const { connectionId, eventTypes } = req.body;

        if (!connectionId || !Array.isArray(eventTypes)) {
          throw new ValidationError('connectionId and eventTypes array are required');
        }

        this.sseHandler.unsubscribe(connectionId, eventTypes);

        const response: ApiResponse = {
          success: true,
          data: { message: 'Unsubscribed successfully', eventTypes },
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // SSE statistics endpoint
    this.app.get('/api/events/stats', authenticate, (req: Request, res: Response) => {
      const stats = this.sseHandler.getStats();

      const response: ApiResponse = {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    });

    // SSE clients endpoint
    this.app.get('/api/events/clients', authenticate, (req: Request, res: Response) => {
      const clients = this.sseHandler.getClients();

      const response: ApiResponse = {
        success: true,
        data: clients,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    });

    // Disconnect SSE client
    this.app.delete(
      '/api/events/clients/:connectionId',
      authenticate,
      (req: Request, res: Response) => {
        const { connectionId } = req.params;
        if (!connectionId) {
          const response: ApiResponse = {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Connection ID is required',
            },
            timestamp: new Date().toISOString(),
          };
          return res.status(400).json(response);
        }
        const disconnected = this.sseHandler.forceDisconnect(connectionId);

        const response: ApiResponse = {
          success: disconnected,
          data: {
            message: disconnected
              ? 'Client disconnected successfully'
              : 'Client not found or already disconnected',
          },
          timestamp: new Date().toISOString(),
        };

        return res.status(disconnected ? 200 : 404).json(response);
      }
    );

    // Event monitoring status
    this.app.get('/api/events/monitoring', authenticate, (req: Request, res: Response) => {
      const status = this.eventListener.getStatus();

      const response: ApiResponse = {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    });

    // Manually trigger flow deploy event
    this.app.post(
      '/api/events/trigger/deploy',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const { flowId } = req.body;

        this.eventListener.onFlowDeploy(flowId);

        const response: ApiResponse = {
          success: true,
          data: { message: 'Flow deploy event triggered', flowId },
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // Node-RED proxy endpoints (optional - for direct API access)
    this.app.get(
      '/api/nodered/flows',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const flows = await this.mcpServer.getNodeRedClient().getFlows();

        const response: ApiResponse = {
          success: true,
          data: flows,
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    this.app.get(
      '/api/nodered/nodes',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const nodes = await this.mcpServer.getNodeRedClient().getNodeTypes();

        const response: ApiResponse = {
          success: true,
          data: nodes,
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    this.app.get(
      '/api/nodered/runtime',
      authenticate,
      asyncHandler(async (req: AuthRequest, res: Response) => {
        const runtime = await this.mcpServer.getNodeRedClient().getRuntimeInfo();

        const response: ApiResponse = {
          success: true,
          data: runtime,
          timestamp: new Date().toISOString(),
        };

        res.json(response);
      })
    );

    // MCP Server Discovery endpoint (for Claude.ai integration)
    this.app.get(
      '/.well-known/mcp-server',
      asyncHandler(async (req: Request, res: Response) => {
        const isClaudeMode = process.env.CLAUDE_COMPATIBLE_MODE === 'true';
        const authRequired = process.env.CLAUDE_AUTH_REQUIRED !== 'false';

        const serverInfo = {
          name: 'nodered-mcp-server',
          version: '1.0.0',
          description: 'Node-RED MCP Server for flow and node management',
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {},
          },
          endpoints: {
            sse: `${req.protocol}://${req.get('host')}/sse`,
            jsonrpc: `${req.protocol}://${req.get('host')}/messages`,
            health: `${req.protocol}://${req.get('host')}/health`,
          },
          auth: {
            type: authRequired ? 'bearer' : 'none',
            required: authRequired,
            modes: isClaudeMode ? ['none', 'bearer', 'api-key'] : ['bearer', 'api-key'],
          },
          transport: {
            type: 'sse',
            version: '2024-11-05',
          },
          server: {
            vendor: 'nodered-mcp-sse',
            version: '1.0.0',
            features: ['tools', 'resources', 'prompts', 'logging', 'streaming'],
          },
        };

        res.json(serverInfo);
      })
    );

    // MCP Server Info endpoint (alternative discovery)
    this.app.get(
      '/api/mcp/info',
      asyncHandler(async (req: Request, res: Response) => {
        const serverInfo = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
              logging: {},
            },
            serverInfo: {
              name: 'nodered-mcp-server',
              version: '1.0.0',
              description: 'Node-RED MCP Server for flow and node management',
            },
          },
        };

        res.json(serverInfo);
      })
    );

    // Debugging endpoint for Claude connection testing
    this.app.get(
      '/debug/claude-connection',
      asyncHandler(async (req: Request, res: Response) => {
        const debugInfo = {
          server: {
            claudeMode: process.env.CLAUDE_COMPATIBLE_MODE === 'true',
            authRequired: process.env.CLAUDE_AUTH_REQUIRED !== 'false',
            acceptAnyToken: process.env.ACCEPT_ANY_BEARER_TOKEN === 'true',
            fallbackEnabled: process.env.AUTH_FALLBACK_ENABLED === 'true',
            debugConnections: process.env.DEBUG_CLAUDE_CONNECTIONS === 'true',
          },
          request: {
            userAgent: req.get('User-Agent'),
            origin: req.get('Origin'),
            authorization: req.headers.authorization ? 'present' : 'missing',
            apiKey: req.headers['x-api-key'] ? 'present' : 'missing',
            headers: Object.keys(req.headers),
          },
          endpoints: {
            sse: `${req.protocol}://${req.get('host')}/sse`,
            health: `${req.protocol}://${req.get('host')}/health`,
            discovery: `${req.protocol}://${req.get('host')}/.well-known/mcp-server`,
          },
          nodeRed: {
            status: 'checking...',
          },
        };

        // Test Node-RED connection
        try {
          const healthResult = await this.mcpServer.getNodeRedClient().healthCheck();
          (debugInfo.nodeRed as any) = {
            status: 'connected',
            health: healthResult,
          };
        } catch (error) {
          (debugInfo.nodeRed as any) = {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          };
        }

        res.json(debugInfo);
      })
    );

    // Catch-all for undefined routes
    this.app.use('*', (req: Request, res: Response) => {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.originalUrl} not found`,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(404).json(response);
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /**
   * Start the Express server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(this.config.port, this.config.host, () => {
          console.log(`Express server listening on http://${this.config.host}:${this.config.port}`);
          console.log(`Available endpoints:`);
          console.log(`  - Health: GET /health`);
          console.log(`  - API Info: GET /api/info`);
          console.log(`  - SSE Events: GET /api/events`);
          console.log(`  - SSE Stats: GET /api/events/stats`);
          console.log(`  - Node-RED Flows: GET /api/nodered/flows`);
          console.log(`  - Node-RED Nodes: GET /api/nodered/nodes`);
          console.log(`  - Node-RED Runtime: GET /api/nodered/runtime`);
          resolve();
        });

        server.on('error', error => {
          reject(error);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
          console.log('SIGTERM received, shutting down gracefully');
          server.close(() => {
            console.log('Express server closed');
            this.sseHandler.destroy();
            process.exit(0);
          });
        });

        process.on('SIGINT', () => {
          console.log('SIGINT received, shutting down gracefully');
          server.close(() => {
            console.log('Express server closed');
            this.sseHandler.destroy();
            process.exit(0);
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Send system information via SSE
   */
  sendSystemInfo(): void {
    this.mcpServer
      .getNodeRedClient()
      .healthCheck()
      .then(health => {
        this.sseHandler.sendSystemInfo({
          nodeRedStatus: health.healthy ? 'connected' : 'error',
          activeFlows: health.details?.flowCount || 0,
          totalNodes: health.details?.nodeCount || 0,
        });
      })
      .catch(error => {
        console.error('Failed to get Node-RED health for SSE:', error);
        this.sseHandler.sendError('Failed to get Node-RED status', undefined, 'system-monitor');
      });
  }

  /**
   * Start system monitoring (send periodic updates via SSE)
   */
  startSystemMonitoring(intervalMs = 30000): void {
    // Start system info updates
    setInterval(() => {
      this.sendSystemInfo();
    }, intervalMs);

    // Start Node-RED event monitoring
    this.eventListener.startEventMonitoring(5000); // Check every 5 seconds
  }

  /**
   * Stop system monitoring
   */
  stopSystemMonitoring(): void {
    this.eventListener.stopEventMonitoring();
  }

  /**
   * Get event listener status
   */
  getEventListenerStatus(): { isMonitoring: boolean; lastEventTimestamp: number } {
    return this.eventListener.getStatus();
  }
}
