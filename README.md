# MCP Node-RED Server

A Model Context Protocol (MCP) server that provides Node-RED integration for Claude Desktop.

## Features

- **Flow Management**: Create, read, update, enable/disable Node-RED flows
- **Module Management**: Search, install, and manage Node-RED palette modules
- **Multiple Transport Modes**: Support for stdio and HTTP transport modes
- **Authentication**: JWT and API key authentication support

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

4. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your Node-RED configuration
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
| `MCP_TRANSPORT`      | Transport mode (`stdio`, `http`)                      | `stdio`                 |
| `PORT`               | HTTP server port (when using HTTP mode)               | `3000`                  |

## Usage

Once configured, you can use these MCP tools in Claude Desktop:

### Flow Management

- `get_flows` - List all flows (summary by default, use includeDetails for full data)
- `get_flow` - Get specific flow details by ID
- `create_flow` - Create new flow with automatic unique ID generation
- `update_flow` - Update existing flow
- `enable_flow` - Enable a specific flow
- `disable_flow` - Disable a specific flow

### Module Management

- `search_modules` - Search for Node-RED palette modules online via npm registry
- `install_module` - Install new Node-RED palette module
- `get_installed_modules` - List currently installed modules

## Examples

Ask Claude to help you with Node-RED tasks like:

- "Show me all my Node-RED flows"
- "Search for dashboard modules"
- "Install the node-red-dashboard module"
- "Create a simple HTTP endpoint flow"
- "Enable flow with ID 'abc123'"
- "Check what modules are installed"

## Development

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm start

# Clean build artifacts
npm run clean
```

## Transport Modes

The server supports multiple transport modes:

- **stdio** (default): Standard MCP communication via stdin/stdout
- **http**: HTTP-based MCP communication

## Requirements

- Node.js 18+
- npm 8+
- Node-RED instance (local or remote)
- Internet connection (for module searching)

## License

MIT License

## Repository

- **GitHub**: https://github.com/ziv-daniel/node-red-mcp
- **Issues**: https://github.com/ziv-daniel/node-red-mcp/issues
