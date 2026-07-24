# 🚀 MCP Node-RED Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)](https://www.typescriptlang.org/)
[![CI/CD](https://github.com/ziv-daniel/node-red-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ziv-daniel/node-red-mcp/actions)

> A modern, production-ready Model Context Protocol (MCP) server for Node-RED
> integration.

## 🌟 Features

### 🔧 20 MCP Tools

Full CRUD for flows, context variables, modules, and diagnostics — plus semantic
search and real-time error detection.

### 📚 Prompts Library

Built-in prompt templates: `debug_flow`, `explain_automation`, `audit_security`,
`document_flow`.

### 📦 MCP Resources

Browse Node-RED state as structured resources: `nodered://flows`,
`nodered://subflows`, `nodered://nodes`, `nodered://context/global`,
`flow://<id>`, `system://runtime`.

### 🔍 Semantic Search

Embeddings-based search across flows and nodes via `semantic_search_flows`.
Finds by meaning, not just keywords.

### 🧠 Elicitation

The server asks clarifying questions mid-call when required parameters are
missing (MCP SDK 1.24+ elicitation).

### 🚨 Real-time Error Detection

`get_node_errors` connects to Node-RED's WebSocket `/comms` endpoint to detect
nodes in error/warning state in real time.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Available Tools](#-available-mcp-tools)
- [Read-Only Mode](#-read-only-mode)
- [Resources](#-mcp-resources)
- [Prompts](#-mcp-prompts)
- [Connecting](#-connecting-to-the-server)
- [Node-RED Authentication](#node-red-authentication)
- [Environment Variables](#-environment-variables)

## ⚡ Quick Start

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **Yarn** 4.x (automatically managed via Corepack)
- **Docker** (optional, for containerized setup)

### Native Installation

```bash
git clone https://github.com/ziv-daniel/node-red-mcp.git
cd node-red-mcp
yarn install
yarn build
```

### Docker

```bash
docker run -e NODERED_URL=http://your-nodered:1880 \
           -e NODERED_USERNAME=admin \
           -e NODERED_PASSWORD=password \
           -p 3000:3000 \
           ghcr.io/ziv-daniel/node-red-mcp:latest
```

## 🔧 Available MCP Tools

### Flow Management

| Tool                    | Description                        | Key Parameters                                   |
| ----------------------- | ---------------------------------- | ------------------------------------------------ |
| `get_flows`             | List flows (summary or full)       | `includeDetails?`, `types?`, `limit?`, `offset?` |
| `get_flow`              | Get a specific flow                | `flowId`                                         |
| `create_flow`           | Create a new flow                  | `flowData`, `validate?`                          |
| `update_flow`           | Update an existing flow            | `flowId`, `flowData`, `validate?`                |
| `enable_flow`           | Enable a flow                      | `flowId`                                         |
| `disable_flow`          | Disable a flow                     | `flowId`                                         |
| `delete_flow`           | Delete a flow (dry-run by default) | `flowId`, `dryRun?`, `confirm?`                  |
| `validate_flow`         | Validate flow structure            | `flowId`                                         |
| `search_flows`          | Search nodes by type/name/property | `type?`, `query?`, `flowId?`                     |
| `semantic_search_flows` | Embeddings-based semantic search   | `query`, `scope?`, `topK?`, `refresh?`           |

### Context Variables

| Tool             | Description                 | Key Parameters                      |
| ---------------- | --------------------------- | ----------------------------------- |
| `get_context`    | Read global or flow context | `key?`, `scope?`, `flowId?`         |
| `set_context`    | Write a context variable    | `key`, `value`, `scope?`, `flowId?` |
| `delete_context` | Delete a context variable   | `key`, `scope?`, `flowId?`          |

### Modules

| Tool                    | Description             | Key Parameters                 |
| ----------------------- | ----------------------- | ------------------------------ |
| `search_modules`        | Search Node-RED palette | `query`, `category?`, `limit?` |
| `install_module`        | Install a module        | `moduleName`, `version?`       |
| `get_installed_modules` | List installed modules  | —                              |

### Diagnostics

| Tool               | Description                                     | Key Parameters                   |
| ------------------ | ----------------------------------------------- | -------------------------------- |
| `get_node_errors`  | Detect nodes in error/warning state (WebSocket) | `includeWarnings?`, `timeoutMs?` |
| `get_flow_state`   | Get flow runtime state (started/stopped)        | —                                |
| `get_settings`     | Get Node-RED runtime settings                   | —                                |
| `get_runtime_info` | Get Node-RED version and system info            | —                                |

## 🔒 Read-Only Mode

Set `MCP_READ_ONLY=true` to structurally prevent any mutation of your Node-RED
flows — useful when exposing this server to remote AI agents where an accidental
or unintended write to a live/production instance is a real risk.

When enabled, write tools (`create_flow`, `update_flow`, `delete_flow`,
`enable_flow`, `disable_flow`, `set_context`, `delete_context`,
`install_module`) are removed from the tool list entirely — clients never see
them as available capabilities — and are also rejected if called directly by
name. All read, search, diagnostic, resource, and prompt capabilities remain
fully available. This pairs naturally with `delete_flow`'s existing `dryRun`
default for deployments that need read/write in the same session but still want
an extra layer of protection against accidental writes.

## 📦 MCP Resources

Access Node-RED state as browseable MCP resources:

| URI                        | Description                     |
| -------------------------- | ------------------------------- |
| `nodered://flows`          | All tab flows (summary)         |
| `nodered://subflows`       | All subflows                    |
| `nodered://nodes`          | Installed node modules          |
| `nodered://context/global` | Global context variables        |
| `flow://<id>`              | Full detail for a specific flow |
| `system://runtime`         | Node-RED runtime info           |

## 📚 MCP Prompts

Built-in prompt templates for common tasks:

| Prompt               | Description                                |
| -------------------- | ------------------------------------------ |
| `debug_flow`         | Diagnose errors in a specific flow         |
| `explain_automation` | Explain what a flow does in plain language |
| `audit_security`     | Security audit of flow configurations      |
| `document_flow`      | Generate documentation for a flow          |

## 🔌 Connecting to the Server

### Transport Modes

| Mode                | Env Var               | Endpoint     | Use Case                  |
| ------------------- | --------------------- | ------------ | ------------------------- |
| **Streamable HTTP** | `MCP_TRANSPORT=http`  | `POST /mcp`  | Production, remote agents |
| **Stdio**           | `MCP_TRANSPORT=stdio` | stdin/stdout | Claude Desktop            |

### Authentication

Set `MCP_USERNAME` and `MCP_PASSWORD` for HTTP Basic Auth on the `/mcp`
endpoint.

### Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "nodered": {
      "command": "node",
      "args": ["path/to/node-red-mcp/dist/index.mjs"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "NODERED_URL": "https://your-nodered-instance.com",
        "NODERED_USERNAME": "admin",
        "NODERED_PASSWORD": "password"
      }
    }
  }
}
```

### Claude Code / Remote Agent (HTTP)

```bash
claude mcp add node-red \
  --transport streamable-http \
  --url https://<your-server>/mcp \
  --header "Authorization: Basic <base64-credentials>"
```

### Node-RED Authentication

Node-RED's admin API only accepts a **Bearer token** — it does not support
HTTP Basic auth. There are two ways to authenticate against it:

- **`NODERED_USERNAME` + `NODERED_PASSWORD`** (recommended) — the server
  exchanges these for a token via Node-RED's `/auth/token` password grant on
  first use, caches it in memory, and transparently re-exchanges it shortly
  before it expires (or immediately after a `401`). You never see the token.
- **`NODERED_API_TOKEN`** — supply an already-issued bearer token directly
  (e.g. one you obtained yourself via `/auth/token`). Useful if you don't want
  this server to hold your Node-RED password, at the cost of having to
  refresh the token yourself once it expires.

If neither is set, requests are sent unauthenticated — only appropriate when
Node-RED's `adminAuth` is disabled.

## ⚙️ Environment Variables

| Variable                      | Required | Default                   | Description                                                                                    |
| ----------------------------- | -------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODERED_URL`                 | Yes      | —                         | URL of your Node-RED instance                                                                  |
| `NODERED_USERNAME`            | No       | —                         | Node-RED admin username (exchanged for a bearer token automatically)                            |
| `NODERED_PASSWORD`            | No       | —                         | Node-RED admin password (exchanged for a bearer token automatically)                            |
| `NODERED_API_TOKEN`           | No       | —                         | Pre-issued Node-RED bearer token; takes precedence over username/password                       |
| `MCP_TRANSPORT`               | No       | `http`                    | `http` or `stdio`                                                                              |
| `MCP_USERNAME`                | No       | —                         | MCP server auth username                                                                       |
| `MCP_PASSWORD`                | No       | —                         | MCP server auth password                                                                       |
| `MCP_READ_ONLY`               | No       | `false`                   | Set `true` to hide write tools and reject write calls — see [Read-Only Mode](#-read-only-mode) |
| `HOST`                        | No       | `0.0.0.0`                 | Bind address                                                                                   |
| `PORT`                        | No       | `3000`                    | Listen port                                                                                    |
| `LOG_LEVEL`                   | No       | `info`                    | `debug`, `info`, `warn`, `error`                                                               |
| `NODERED_REJECT_UNAUTHORIZED` | No       | `true`                    | Set `false` to allow self-signed TLS                                                           |
| `EMBEDDING_MODEL`             | No       | `Xenova/all-MiniLM-L6-v2` | Model for semantic search                                                                      |
