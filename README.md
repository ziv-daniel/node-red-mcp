# MCP Node-RED SSE Integration Server

A comprehensive **Model Context Protocol (MCP)** server that provides Node-RED integration with **Server-Sent Events (SSE)** support for real-time flow monitoring and management.

## 🚀 Features

### Core Capabilities
- **Full Node-RED Integration**: Complete CRUD operations on flows and nodes
- **Real-time SSE Streaming**: Live monitoring of flow status and events
- **MCP Protocol Compliance**: Standard tools, resources, and prompts
- **Secure Authentication**: JWT and API key support
- **Production Ready**: Comprehensive error handling and logging

### Node-RED Operations
- ✅ Flow Management (CRUD, enable/disable, deploy)
- ✅ Node Management (install/uninstall modules, enable/disable types)
- ✅ Runtime Monitoring (system info, health checks, context management)
- ✅ Real-time Events (flow status, node events, errors)

### Server-Sent Events
- ✅ Real-time flow status updates
- ✅ Node execution events
- ✅ System health monitoring
- ✅ Error notifications
- ✅ Connection management
- ✅ Event filtering and subscriptions

## 📦 Installation

### Prerequisites
- **Node.js 18+**
- **npm 8+**
- **Node-RED instance** (local or remote)

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd mcp-nodered-server

# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Configure your Node-RED connection in .env
# Edit NODERED_URL, authentication settings, etc.

# Build the project
npm run build

# Start in development mode
npm run dev

# Or start in production mode
npm start
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```bash
# Application Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Node-RED Configuration
NODERED_URL=http://localhost:1880
NODERED_USERNAME=admin
NODERED_PASSWORD=your-password
NODERED_API_TOKEN=your-api-token

# MCP Configuration
MCP_TRANSPORT=stdio  # stdio, http, or both
MCP_SERVER_NAME=nodered-mcp-server

# Authentication
JWT_SECRET=your-super-secret-jwt-key
API_KEY=your-api-key

# SSE Configuration
SSE_HEARTBEAT_INTERVAL=30000
SSE_MAX_CONNECTIONS=100

# Security
CORS_ORIGIN=*
RATE_LIMIT_MAX_REQUESTS=100

# Claude Integration Settings
CLAUDE_AUTH_REQUIRED=false          # Disable auth requirement for Claude testing
CLAUDE_COMPATIBLE_MODE=true         # Enable Claude.ai compatibility features
DEBUG_CLAUDE_CONNECTIONS=true       # Enhanced logging for Claude connections
ACCEPT_ANY_BEARER_TOKEN=true        # Accept any Bearer token in Claude mode
AUTH_FALLBACK_ENABLED=true          # Enable authentication fallbacks
```

### Transport Modes

The server supports multiple transport modes:

1. **stdio** (default): Standard MCP protocol via stdin/stdout
2. **http**: HTTP REST API with SSE support
3. **both**: Both stdio and HTTP simultaneously

```bash
# stdio only (for MCP clients)
MCP_TRANSPORT=stdio

# HTTP only (for web applications)
MCP_TRANSPORT=http
HTTP_ENABLED=true

# Both transports
MCP_TRANSPORT=both
```

## 🛠️ Usage

### MCP Client Integration

#### Using with Cline/Claude Desktop

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "nodered": {
      "command": "node",
      "args": ["/path/to/mcp-nodered-server/dist/index.js"],
      "env": {
        "NODERED_URL": "http://localhost:1880"
      }
    }
  }
}
```

#### Available MCP Tools

```typescript
// Flow Management
get_flows()                    // List all flows
get_flow(flowId)              // Get specific flow
create_flow(flowData)         // Create new flow
update_flow(flowId, data)     // Update flow
delete_flow(flowId)           // Delete flow
deploy_flows(type?)           // Deploy flows
enable_flow(flowId)           // Enable flow
disable_flow(flowId)          // Disable flow

// Node Management
get_node_types()              // List node types
enable_node_type(nodeId)      // Enable node type
install_node_module(name)     // Install module
uninstall_node_module(name)   // Uninstall module

// Runtime & Monitoring
get_runtime_info()            // Get system info
get_flow_status()             // Get flow status
health_check()                // Health check
start_flows()                 // Start all flows
stop_flows()                  // Stop all flows

// Context Management
get_global_context(key?)      // Get global context
set_global_context(key, val)  // Set context value
delete_global_context(key)    // Delete context key

// SSE Management
get_sse_stats()               // SSE statistics
get_sse_clients()             // Connected clients
disconnect_sse_client(id)     // Disconnect client
```

### HTTP API Usage

#### Health Check

```bash
curl http://localhost:3000/health
```

#### Node-RED API Proxy

```bash
# Get flows
curl -H "Authorization: Bearer YOUR_JWT" \
     http://localhost:3000/api/nodered/flows

# Get nodes
curl -H "X-API-Key: YOUR_API_KEY" \
     http://localhost:3000/api/nodered/nodes
```

#### Server-Sent Events

```javascript
// Connect to SSE stream
const eventSource = new EventSource('/api/events', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT'
  }
});

// Listen for events
eventSource.addEventListener('heartbeat', (event) => {
  const data = JSON.parse(event.data);
  console.log('Server heartbeat:', data);
});

eventSource.addEventListener('flow-event', (event) => {
  const data = JSON.parse(event.data);
  console.log('Flow event:', data);
});

eventSource.addEventListener('system-info', (event) => {
  const data = JSON.parse(event.data);
  console.log('System info:', data);
});
```

#### Subscription Management

```bash
# Subscribe to specific events
curl -X POST http://localhost:3000/api/events/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "connectionId": "connection-id",
    "eventTypes": ["flow-event", "node-event"]
  }'

# Get SSE statistics
curl -H "Authorization: Bearer YOUR_JWT" \
     http://localhost:3000/api/events/stats
```

## 📊 Monitoring & Observability

### SSE Event Types

| Event Type | Description | Data |
|------------|-------------|------|
| `heartbeat` | Server heartbeat | `{ serverTime, connections }` |
| `system-info` | System status | `{ memory, uptime, nodeRedStatus }` |
| `flow-event` | Flow status changes | `{ id, event, message }` |
| `node-event` | Node execution events | `{ id, type, event, msg }` |
| `error-event` | Error notifications | `{ error, source, connectionId }` |
| `connection-status` | SSE connection status | `{ connectionId, status }` |

### Health Checks

The server provides comprehensive health monitoring:

```json
{
  "success": true,
  "data": {
    "server": "healthy",
    "nodeRed": {
      "healthy": true,
      "details": {
        "version": "3.1.0",
        "flowCount": 5,
        "nodeCount": 25
      }
    },
    "sse": {
      "activeConnections": 3,
      "totalConnections": 15,
      "uptime": 1234567
    },
    "memory": {
      "used": 45678900,
      "total": 134217728
    },
    "uptime": 86400
  }
}
```

## 🔒 Security

### Authentication Methods

1. **JWT Tokens**: For user-specific access
2. **API Keys**: For service-to-service communication
3. **Node-RED Auth**: Supports Node-RED's authentication

### Security Features

- **CORS Protection**: Configurable origin restrictions
- **Rate Limiting**: Prevents abuse and DoS attacks  
- **Helmet Security**: Security headers for HTTP responses
- **Input Validation**: Comprehensive request validation
- **Error Sanitization**: Safe error responses

### Permission System

```typescript
// Available permissions
const permissions = [
  'flows:read',      // Read flow data
  'flows:write',     // Create/update flows
  'flows:deploy',    // Deploy flows
  'nodes:manage',    // Manage node types
  'runtime:access',  // Access runtime info
  'logs:view',       // View logs
  'settings:manage', // Manage settings
  '*'               // All permissions
];
```

## 🚀 Deployment

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY config/ ./config/

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-nodered-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NODERED_URL=http://nodered:1880
      - PORT=3000
    depends_on:
      - nodered
    
  nodered:
    image: nodered/node-red:latest
    ports:
      - "1880:1880"
    volumes:
      - nodered_data:/data

volumes:
  nodered_data:
```

### Production Considerations

1. **Environment Variables**: Use secure secret management
2. **SSL/TLS**: Enable HTTPS for production deployments
3. **Load Balancing**: Use reverse proxy for scaling
4. **Monitoring**: Integrate with monitoring solutions
5. **Logging**: Configure structured logging
6. **Backup**: Regular backup of Node-RED flows

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### Test Categories

- **Unit Tests**: Individual component testing
- **Integration Tests**: Node-RED API integration
- **E2E Tests**: Complete workflow testing
- **SSE Tests**: Real-time event testing

## 📚 API Documentation

### MCP Resources

| URI | Description |
|-----|-------------|
| `flow://{id}` | Individual flow configuration |
| `system://runtime` | Node-RED system information |
| `sse://stats` | SSE statistics and connections |

### MCP Prompts

| Name | Description |
|------|-------------|
| `create_simple_flow` | Generate basic flow patterns |
| `debug_flow_issues` | Help debug flow problems |
| `optimize_flow_performance` | Performance optimization tips |
| `flow_documentation` | Generate flow documentation |

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Commit** your changes
4. **Push** to the branch
5. **Open** a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Build for production
npm run build
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🛟 Support

- **Documentation**: Check the `/docs` directory
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join GitHub Discussions for questions
- **Security**: Report security issues privately

## 🎯 Roadmap

- [ ] **WebSocket Support**: Alternative to SSE for real-time events
- [ ] **GraphQL API**: Query-based API interface
- [ ] **Plugin System**: Extensible functionality
- [ ] **Dashboard UI**: Web-based management interface
- [ ] **Metrics Export**: Prometheus/OpenTelemetry integration
- [ ] **Multi-tenant Support**: Support multiple Node-RED instances
- [ ] **Flow Templates**: Pre-built flow patterns
- [ ] **AI Integration**: Enhanced flow generation with AI

---

**Built with ❤️ for the Node-RED and MCP communities**

## 🔗 Claude.ai Integration

This server provides native support for Claude.ai website integration with flexible authentication and enhanced compatibility.

### Quick Setup for Claude

1. **Start in Claude-compatible mode:**
   ```bash
   # Windows
   start-claude-mode.bat
   
   # Linux/macOS
   ./start-claude-mode.sh
   ```

2. **Use the SSE endpoint in Claude:**
   ```
   http://localhost:3000/sse
   ```

3. **For external access (using ngrok or similar):**
   ```
   https://your-tunnel-domain.ngrok.io/sse
   ```

### Claude Integration Features

- **Flexible Authentication**: Works with or without Bearer tokens
- **Enhanced CORS**: Supports Claude.ai domains out of the box
- **Debug Endpoints**: Built-in troubleshooting tools
- **MCP Protocol Compliance**: Full compatibility with Claude's expected SSE format

### Troubleshooting Claude Connection

1. **Check debug endpoint:**
   ```bash
   curl http://localhost:3000/debug/claude-connection
   ```

2. **Verify discovery endpoint:**
   ```bash
   curl http://localhost:3000/.well-known/mcp-server
   ```

3. **Enable debug logging:**
   ```bash
   export DEBUG_CLAUDE_CONNECTIONS=true
   ```

4. **Test connection:**
   ```bash
   node test-claude-integration.js
   ```