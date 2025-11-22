# 🚀 MCP Node-RED Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)](https://www.typescriptlang.org/)
[![CI/CD](https://github.com/your-org/nodered-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/nodered-mcp/actions)
[![CodeQL](https://github.com/your-org/nodered-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/your-org/nodered-mcp/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/your-org/nodered-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/nodered-mcp)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=your-org_nodered-mcp&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=your-org_nodered-mcp)

> A modern, production-ready Model Context Protocol (MCP) server for Node-RED
> integration, built with best practices.

## 🌟 Features

### 🚀 **Architecture**

- **Node.js 22 LTS** with latest JavaScript features
- **TypeScript 5.7+** with strict type checking
- **ESM-first** with dual ESM/CJS output using `tsup`
- **Yarn 4** with zero-installs and modern package management

### 🔄 **Node-RED Integration**

- **Node-RED v4** support with latest features
- **Real-time** flow monitoring via SSE
- **Template flows** for common MCP patterns
- **Admin API** integration for flow management
- **WebSocket** support for live updates

### 🛡️ **Reliability & Resilience (2025 Updates)**

- **Circuit Breaker Pattern** for fault tolerance
- **Exponential Backoff Retry** with smart failure handling
- **Request Timeout Management** with proper cleanup
- **Server Discovery** via `.well-known/mcp.json` (November 2025 spec)
- **MCP SDK 1.22.0** with latest protocol enhancements
- **Comprehensive Error Handling** with 19 test cases

### 📊 **Observability**

- **Structured Logging** with Pino
- **OpenTelemetry Integration** for distributed tracing
- **Circuit Breaker Metrics** and health monitoring
- **Request Correlation IDs** for debugging
- **Performance Metrics** collection

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)

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
