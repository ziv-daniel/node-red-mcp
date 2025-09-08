# 🚀 MCP Node-RED Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)](https://www.typescriptlang.org/)
[![CI/CD](https://github.com/your-org/nodered-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/nodered-mcp/actions)
[![CodeQL](https://github.com/your-org/nodered-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/your-org/nodered-mcp/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/your-org/nodered-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/nodered-mcp)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=your-org_nodered-mcp&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=your-org_nodered-mcp)

> A modern, production-ready Model Context Protocol (MCP) server for Node-RED
> integration, built with 2025 best practices.

## 🌟 Features

### 🚀 **2025 Modern Architecture**

- **Node.js 22 LTS** with latest JavaScript features
- **TypeScript 5.7+** with strict type checking
- **ESM-first** with dual ESM/CJS output using `tsup`
- **Yarn 4** with zero-installs and modern package management

### 🔒 **Enterprise Security**

- **Zod** runtime validation for all inputs
- **JWT** authentication with configurable secrets
- **Rate limiting** with Redis backend
- **CORS** protection with configurable origins
- **Helmet.js** security headers
- **OWASP** compliance and automated security scanning

### 🧪 **Comprehensive Testing**

- **Vitest** for lightning-fast unit tests with 85%+ coverage
- **Playwright** for end-to-end testing across browsers
- **Testing Library** for component testing
- **MSW** for API mocking
- **Pre-commit hooks** with Husky and lint-staged

### 📊 **Production Observability**

- **Silent operation** in stdio mode for MCP protocol compatibility
- **OpenTelemetry** distributed tracing (HTTP mode only)
- **Prometheus** metrics with custom gauges and counters
- **Grafana** dashboards for visualization
- **Health checks** with detailed system information

### 🐳 **Cloud-Native Deployment**

- **Multi-stage Dockerfile** with security best practices
- **Docker Compose** for local development
- **GitHub Actions** CI/CD with security scanning
- **Container registry** publishing
- **Kubernetes** ready with health checks

### 🔄 **Node-RED Integration**

- **Node-RED v4** support with latest features
- **Real-time** flow monitoring via SSE
- **Template flows** for common MCP patterns
- **Admin API** integration for flow management
- **WebSocket** support for live updates

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Monitoring](#-monitoring)
- [Contributing](#-contributing)
- [License](#-license)

## ⚡ Quick Start

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **Yarn** 4.x (automatically managed via Corepack)
- **Claude Desktop** or other MCP client (for stdio mode)
- **Docker** & **Docker Compose** (optional, for containerized setup)

### 🚀 Option 1: Native Installation (For Claude Desktop)

```bash
# Clone the repository
git clone https://github.com/your-org/nodered-mcp.git
cd nodered-mcp

# Install dependencies (Yarn 4 will be automatically used)
yarn install

# Build the project (no .env file needed for stdio mode)
yarn build

# Test the server (optional)
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | node dist/index.mjs

# Configure in Claude Desktop (see Usage section)
```

### 🐳 Option 2: Docker Compose (For HTTP Mode Development)

```bash
# Clone and start the full stack
git clone https://github.com/your-org/nodered-mcp.git
cd nodered-mcp

# Start all services (includes Node-RED, PostgreSQL, Redis, monitoring)
docker-compose up -d

# View logs
docker-compose logs -f mcp-server
```

Access the services:

- **MCP Server**: http://localhost:3000
- **Node-RED**: http://localhost:1880
- **Grafana**: http://localhost:3001 (admin/admin)
- **Jaeger**: http://localhost:16686

## 🔧 Installation

### System Requirements

- **Node.js**: 22.0.0 or higher
- **Memory**: 512MB minimum, 2GB recommended
- **Storage**: 1GB available space

### Local Development Setup

```bash
# Enable Corepack (if not already enabled)
corepack enable

# Verify versions
node --version  # Should be 22.x.x
yarn --version  # Should be 4.x.x

# Install dependencies
yarn install

# Set up environment
cp env.example .env
# Edit .env file with your configuration

# Run in development mode with hot reload
yarn dev
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following configuration:

```bash
# Application
NODE_ENV=development
PORT=3000

# MCP Configuration (2025 Update)
MCP_TRANSPORT=stdio          # stdio | http | both (stdio recommended for Claude Desktop)
HTTP_ENABLED=false           # Enable HTTP server

# Node-RED Configuration
NODERED_URL=https://your-nodered-instance.com
NODERED_USERNAME=your-username
NODERED_PASSWORD=your-secure-password

# Security (Enhanced 2025) - Only needed for HTTP mode
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
CORS_ORIGIN=*
RATE_LIMIT_WINDOW=900000     # 15 minutes
RATE_LIMIT_MAX=100

# Logging (Note: Disabled in stdio mode for MCP compatibility)
LOG_LEVEL=info               # error | warn | info | debug (only applies to HTTP mode)
```

### Advanced Configuration

For production deployments, see [Configuration Guide](docs/CONFIGURATION.md).

## 🎯 Usage

### Claude Desktop Integration (Recommended)

Add to your Claude Desktop configuration
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "nodered": {
      "command": "node",
      "args": ["path/to/nodered_mcp/dist/index.mjs"],
      "env": {
        "NODERED_URL": "https://your-nodered-instance.com",
        "NODERED_USERNAME": "your-username",
        "NODERED_PASSWORD": "your-secure-password"
      }
    }
  }
}
```

### MCP Client Integration (Programmatic)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connect to MCP server
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.mjs'],
  env: {
    NODERED_URL: 'https://your-nodered-instance.com',
    NODERED_USERNAME: 'your-username',
    NODERED_PASSWORD: 'your-secure-password',
  },
});

const client = new Client(
  { name: 'node-red-client', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'get_flows',
  arguments: {},
});
```

### Available MCP Tools

| Tool                    | Description                       | Arguments                              |
| ----------------------- | --------------------------------- | -------------------------------------- |
| `get_flows`             | Get Node-RED flows (summary/full) | `includeDetails?: boolean`             |
| `get_flow`              | Get specific flow details         | `flowId: string`                       |
| `create_flow`           | Create a new Node-RED flow        | `flowData: object`                     |
| `update_flow`           | Update an existing flow           | `flowId: string, flowData: object`     |
| `enable_flow`           | Enable a specific flow            | `flowId: string`                       |
| `disable_flow`          | Disable a specific flow           | `flowId: string`                       |
| `search_modules`        | Search Node-RED palette modules   | `query: string, category?: string`     |
| `install_module`        | Install a Node-RED module         | `moduleName: string, version?: string` |
| `get_installed_modules` | Get installed modules             | None                                   |

## 📚 API Documentation

### Health Check Endpoints

```bash
# Comprehensive health check
GET /health

# Kubernetes readiness probe
GET /ready

# Kubernetes liveness probe
GET /alive

# Prometheus metrics
GET /metrics
```

### Example Health Response

```json
{
  "status": "healthy",
  "timestamp": "2024-12-17T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "system": {
      "status": "pass",
      "time": 5,
      "output": "Memory utilization: 45% (256MB/512MB)"
    },
    "nodeRed": {
      "status": "pass",
      "time": 12,
      "responseTime": 10
    }
  },
  "services": {
    "nodeRed": {
      "status": "available",
      "responseTime": 10,
      "lastCheck": "2024-12-17T10:30:00Z"
    },
    "mcp": {
      "connections": 2,
      "activeTools": 10,
      "lastActivity": "2024-12-17T10:29:45Z"
    }
  },
  "metrics": {
    "http": {
      "requests": 1250,
      "errors": 3,
      "averageResponseTime": 45
    }
  }
}
```

### SSE Event Stream

```bash
# Subscribe to real-time events
GET /api/events
Accept: text/event-stream
```

## 🛠️ Development

### Development Scripts

```bash
# Development with hot reload
yarn dev

# Build for production
yarn build
yarn build:prod

# Type checking
yarn type-check

# Code quality
yarn lint
yarn lint:fix
yarn format
yarn format:check
yarn quality            # Run all checks

# Testing
yarn test               # Unit tests
yarn test:watch         # Watch mode
yarn test:coverage      # With coverage
yarn test:e2e           # End-to-end tests
yarn test:e2e:ui        # E2E with UI
```

### Project Structure

```
nodered_mcp/
├── 📁 src/                    # Source code
│   ├── 📁 server/            # MCP server implementation
│   ├── 📁 services/          # Business logic services
│   ├── 📁 types/             # TypeScript type definitions
│   └── 📁 utils/             # Utility functions
├── 📁 test/                  # Unit test setup
├── 📁 e2e/                   # End-to-end tests
├── 📁 flows/                 # Node-RED flow templates
├── 📁 docker/                # Docker configuration
├── 📁 .github/               # GitHub Actions workflows
├── 📄 package.json           # Dependencies & scripts
├── 📄 tsconfig.json          # TypeScript configuration
├── 📄 vitest.config.ts       # Vitest configuration
├── 📄 playwright.config.ts   # Playwright configuration
└── 📄 docker-compose.yml     # Local development stack
```

## 🧪 Testing

### Running Tests

```bash
# Unit tests with coverage
yarn test:coverage

# E2E tests (requires running server)
yarn test:e2e

# Run all tests
yarn test && yarn test:e2e
```

### Test Coverage

Current coverage targets:

- **Statements**: 85%
- **Branches**: 85%
- **Functions**: 85%
- **Lines**: 85%

### Writing Tests

```typescript
// Unit test example
import { describe, it, expect } from 'vitest';
import { validateMcpToolRequest } from '../types/validation.js';

describe('MCP Tool Validation', () => {
  it('should validate correct tool request', () => {
    const request = {
      name: 'list-flows',
      arguments: {},
    };

    expect(() => validateMcpToolRequest(request)).not.toThrow();
  });
});
```

```typescript
// E2E test example
import { test, expect } from '@playwright/test';

test('health check endpoint', async ({ request }) => {
  const response = await request.get('/health');

  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data.status).toBe('healthy');
});
```

## 🚀 Deployment

### Production Environment

```bash
# Build for production
NODE_ENV=production yarn build:prod

# Start production server
NODE_ENV=production yarn start
```

### Docker Production Build

```bash
# Build production image
docker build -f docker/Dockerfile --target production -t mcp-nodered-server .

# Run production container
docker run -d \
  --name mcp-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e MCP_TRANSPORT=stdio \
  -e NODERED_URL=http://nodered:1880 \
  mcp-nodered-server
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-nodered-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-nodered-server
  template:
    metadata:
      labels:
        app: mcp-nodered-server
    spec:
      containers:
        - name: mcp-server
          image: ghcr.io/your-org/nodered-mcp:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
          livenessProbe:
            httpGet:
              path: /alive
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

## 📊 Monitoring

### Metrics & Observability

The server exposes comprehensive metrics and observability (HTTP mode only):

- **Prometheus Metrics**: `/metrics` endpoint
- **OpenTelemetry Tracing**: Distributed tracing support
- **Silent Operation**: No logging in stdio mode for MCP protocol compatibility
- **Health Checks**: Multiple probe endpoints

### Grafana Dashboards

Pre-built dashboards available in `docker/grafana/dashboards/`:

- **Application Overview**: Key metrics and alerts
- **Node-RED Integration**: Flow monitoring and performance
- **System Resources**: Memory, CPU, and network usage
- **Error Tracking**: Error rates and patterns

### Alerting

Configure alerts for:

- High error rates (>5%)
- Memory usage (>80%)
- Response time degradation (>1s p99)
- Node-RED connectivity issues

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Quality Standards

- ✅ **TypeScript**: Strict type checking required
- ✅ **ESLint**: Code must pass linting
- ✅ **Prettier**: Auto-formatted code
- ✅ **Tests**: 85%+ coverage for new code
- ✅ **Documentation**: Update docs for new features

## 🔧 Important Notes

### Stdio vs HTTP Mode

- **Stdio Mode** (Default): Designed for MCP clients like Claude Desktop
  - No logging output to maintain clean JSON-RPC communication
  - Environment variables passed via client configuration
  - Optimized for MCP protocol compatibility

- **HTTP Mode**: For web-based integrations and monitoring
  - Full logging and observability features enabled
  - Requires `.env` file configuration
  - Includes health checks, metrics, and SSE endpoints

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE)
file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - For the MCP
  specification
- [Node-RED](https://nodered.org/) - For the amazing flow-based programming
  platform
- [TypeScript](https://www.typescriptlang.org/) - For type safety and developer
  experience
- [Vitest](https://vitest.dev/) - For fast and reliable testing
- [OpenTelemetry](https://opentelemetry.io/) - For observability standards

## 📞 Support

- 📧 **Email**: support@example.com
- 💬 **Discussions**:
  [GitHub Discussions](https://github.com/your-org/nodered-mcp/discussions)
- 🐛 **Bug Reports**:
  [GitHub Issues](https://github.com/your-org/nodered-mcp/issues)
- 📖 **Documentation**: [Wiki](https://github.com/your-org/nodered-mcp/wiki)

---

<div align="center">

**[⬆ Back to Top](#-mcp-node-red-server)**

Made with ❤️ by the MCP Node-RED Server team

[![GitHub stars](https://img.shields.io/github/stars/your-org/nodered-mcp?style=social)](https://github.com/your-org/nodered-mcp)
[![GitHub forks](https://img.shields.io/github/forks/your-org/nodered-mcp?style=social)](https://github.com/your-org/nodered-mcp/fork)
[![GitHub watchers](https://img.shields.io/github/watchers/your-org/nodered-mcp?style=social)](https://github.com/your-org/nodered-mcp)

</div>
