# Tech Context: MCP Node-RED SSE Integration Server

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 18+ (LTS)
- **Language**: TypeScript 5.3+ (full type safety)
- **Protocol**: Model Context Protocol (MCP) via @modelcontextprotocol/sdk
- **Web Framework**: Express.js 4.18+ (HTTP transport & SSE)
- **HTTP Client**: Axios 1.6+ (Node-RED API communication)

### Development Tools
- **Build System**: TypeScript Compiler (tsc)
- **Development**: tsx (TypeScript execution)
- **Testing**: Jest 29+ with TypeScript support
- **Linting**: ESLint + TypeScript ESLint + Prettier
- **Package Manager**: npm 8+ (lockfile v2)

### Production Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.12.1",  // MCP protocol implementation
  "axios": "^1.6.0",                       // HTTP client for Node-RED API
  "config": "^3.3.9",                      // Configuration management
  "cors": "^2.8.5",                        // Cross-origin resource sharing
  "dotenv": "^16.5.0",                     // Environment variable loading
  "express": "^4.18.2",                    // Web server framework
  "express-rate-limit": "^7.1.5",          // Rate limiting middleware
  "helmet": "^7.1.0",                      // Security headers middleware
  "joi": "^17.11.0",                       // Data validation (legacy)
  "jsonwebtoken": "^9.0.2",                // JWT authentication
  "multer": "^1.4.5-lts.1",                // File upload handling
  "uuid": "^9.0.1",                        // UUID generation
  "winston": "^3.11.0",                    // Logging framework
  "ws": "^8.14.2",                         // WebSocket support
  "zod": "^3.22.4"                         // TypeScript-first validation
}
```

## Architecture Constraints

### Node.js Environment
- **Minimum Version**: Node.js 18.0.0 (ES modules, fetch API)
- **Module System**: ES modules (type: "module")
- **Import Strategy**: .js extensions required for local imports
- **Platform Support**: Cross-platform (Windows, macOS, Linux)

### TypeScript Configuration
- **Target**: ES2022 (modern features, Node.js 18+ support)
- **Module Resolution**: Node16 (proper ES module support)
- **Strict Mode**: Enabled (strict type checking)
- **Output**: dist/ directory (compiled JavaScript)

### Transport Constraints
- **stdio Transport**: JSON-RPC over stdin/stdout (MCP standard)
- **HTTP Transport**: REST API + SSE on configurable port
- **Concurrent Support**: Both transports can run simultaneously
- **Security**: Authentication required for HTTP transport

## Development Setup

### Prerequisites
```bash
# Required versions
node --version    # >= 18.0.0
npm --version     # >= 8.0.0
```

### Local Development
```bash
# Environment setup
cp env.example .env
# Edit .env with Node-RED connection details

# Development workflow
npm install           # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Start with hot reload
npm run test         # Run test suite
npm run lint         # Check code quality
```

### Configuration Management
- **Environment Variables**: .env file (development)
- **Config Package**: config/ directory (environment-specific)
- **Runtime Config**: Environment variable override support
- **Validation**: Zod schemas for configuration validation

## Deployment Constraints

### Docker Support
- **Base Image**: node:18-alpine (minimal footprint)
- **Multi-stage Build**: Build stage + runtime stage
- **Port Exposure**: Configurable HTTP port (default 3000)
- **Environment**: Production environment variables

### Production Requirements
- **Process Management**: PM2 or similar (not included)
- **Reverse Proxy**: Nginx/Apache for HTTPS termination
- **Monitoring**: Health check endpoint (/health)
- **Logging**: Structured JSON logs via Winston

### Security Requirements
- **Authentication**: JWT tokens or API keys
- **HTTPS**: Required for production (reverse proxy)
- **Rate Limiting**: Built-in express-rate-limit
- **CORS**: Configurable origin restrictions
- **Headers**: Security headers via Helmet.js

## Integration Requirements

### Node-RED Compatibility
- **API Version**: Node-RED Admin API v2+
- **Authentication**: Support for username/password and bearer tokens
- **Network**: HTTP/HTTPS connection to Node-RED instance
- **Permissions**: Admin-level access required for full functionality

### MCP Protocol Compliance
- **Version**: MCP SDK 1.12.1+
- **Transports**: stdio (required), HTTP (optional)
- **Features**: Tools, Resources, Prompts support
- **Error Handling**: Standard MCP error codes and messages

## Performance Considerations

### Connection Management
- **SSE Connections**: Maximum configurable limit (default 100)
- **HTTP Keep-Alive**: Enabled for Node-RED API calls
- **Connection Pooling**: Axios default connection reuse
- **Timeout Handling**: Configurable request timeouts

### Memory Management
- **Event Buffer**: Limited buffer for SSE events
- **Connection Cleanup**: Automatic cleanup of dead connections
- **Garbage Collection**: Regular cleanup of expired data
- **Memory Monitoring**: Health check includes memory usage

### Scalability Limits
- **Single Process**: Not designed for horizontal scaling
- **Concurrent Requests**: Limited by Node.js event loop
- **SSE Scaling**: Consider Redis for multi-instance deployments
- **Database**: No persistent storage (stateless design)

## Testing Strategy

### Test Environment
- **Framework**: Jest with TypeScript support
- **Mocking**: Jest mocks for external dependencies
- **Coverage**: Code coverage reporting enabled
- **CI/CD**: GitHub Actions workflow (if configured)

### Test Categories
- **Unit Tests**: Service layer and utility functions
- **Integration Tests**: MCP tools and Node-RED API client
- **E2E Tests**: Full transport and protocol testing
- **Performance Tests**: Load testing for SSE connections

## Known Technical Debt

### Current Limitations
1. **Single Node-RED Instance**: No multi-instance support
2. **In-Memory State**: No persistence for connection state
3. **Basic Auth**: Limited authentication strategy options
4. **Error Recovery**: Basic retry logic without exponential backoff
5. **Monitoring**: Limited built-in metrics and monitoring

### Future Improvements
1. **Redis Integration**: For multi-instance SSE support
2. **Database Layer**: For persistent state and audit logging
3. **Advanced Auth**: OAuth2, SAML, multi-factor authentication
4. **Monitoring**: Prometheus metrics, health dashboards
5. **Clustering**: Multi-process support with shared state

This technical foundation provides a solid base for the MCP Node-RED integration while maintaining flexibility for future enhancements and scaling requirements.
