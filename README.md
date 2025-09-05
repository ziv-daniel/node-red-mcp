# MCP Node-RED Server

A Model Context Protocol (MCP) server that provides Node-RED integration for Claude Desktop.

## Features

- **Flow Management**: Create, read, update, and delete Node-RED flows
- **Node Management**: Install/uninstall node modules, manage node types
- **Real-time Monitoring**: Server-Sent Events for live flow status
- **Runtime Control**: Start/stop flows, manage global context
- **Health Monitoring**: System status and health checks

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ziv-daniel/node-red-mcp.git
   cd node-red-mcp
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Claude Desktop Configuration

Add this to your Claude Desktop MCP configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nodered": {
      "command": "node",
      "args": ["/path/to/node-red-mcp/dist/index.js"],
      "env": {
        "NODERED_URL": "http://localhost:1880",
        "NODERED_USERNAME": "your-username",
        "NODERED_PASSWORD": "your-password"
      }
    }
  }
}
```

### Configuration Options

| Environment Variable | Description                                           | Default                 |
| -------------------- | ----------------------------------------------------- | ----------------------- |
| `NODERED_URL`        | Node-RED instance URL                                 | `http://localhost:1880` |
| `NODERED_USERNAME`   | Node-RED username                                     | -                       |
| `NODERED_PASSWORD`   | Node-RED password                                     | -                       |
| `NODERED_API_TOKEN`  | Node-RED API token (alternative to username/password) | -                       |
| `MCP_TRANSPORT`      | Transport mode                                        | `stdio`                 |
| `PORT`               | HTTP server port (when using HTTP mode)               | `3000`                  |

## Usage

Once configured, you can use these MCP tools in Claude Desktop:

### Flow Management

- `get_flows` - List all flows (summary by default)
- `get_flow` - Get specific flow details
- `create_flow` - Create new flow
- `update_flow` - Update existing flow
- `delete_flow` - Delete flow
- `deploy_flows` - Deploy flows to Node-RED

### Node Management

- `get_node_types` - List available node types
- `install_node_module` - Install new node module
- `uninstall_node_module` - Remove node module

### Runtime Control

- `get_runtime_info` - Get system information
- `start_flows` - Start all flows
- `stop_flows` - Stop all flows
- `health_check` - Check system health

### Context Management

- `get_global_context` - Get global context variables
- `set_global_context` - Set global context variable
- `delete_global_context` - Delete global context variable

## Examples

Ask Claude to help you with Node-RED tasks like:

- "Show me all my Node-RED flows"
- "Create a simple HTTP endpoint flow"
- "Install the dashboard nodes"
- "Check if Node-RED is running properly"
- "Deploy my flows"

## Development

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Requirements

- Node.js 18+
- npm 8+
- Node-RED instance (local or remote)

## License

MIT License - see LICENSE file for details.

## Repository

- **GitHub**: https://github.com/ziv-daniel/node-red-mcp
- **Issues**: https://github.com/ziv-daniel/node-red-mcp/issues
