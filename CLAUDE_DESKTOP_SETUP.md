# Claude Desktop Setup Guide for Node-RED MCP Server

## Quick Setup Steps

### 1. Locate Your Claude Desktop Config File

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### 2. Add the Server Configuration

Copy the contents of `claude_desktop_config.json` from this repository to your Claude Desktop config file. If the file doesn't exist, create it.

If you already have other MCP servers configured, add the `nodered-mcp-server` entry to the existing `mcpServers` object.

### 3. Update Node-RED Credentials

Edit the config to match your Node-RED instance:

```json
{
  "mcpServers": {
    "nodered-mcp-server": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "c:\\Repo\\noderd_mcp_sse",
      "env": {
        "MCP_TRANSPORT": "stdio",
        "NODERED_URL": "YOUR_NODERED_URL",
        "NODERED_USERNAME": "YOUR_USERNAME", 
        "NODERED_PASSWORD": "YOUR_PASSWORD",
        "NODE_ENV": "production",
        "MCP_SERVER_NAME": "nodered-mcp-server",
        "MCP_SERVER_VERSION": "1.0.0"
      }
    }
  }
}
```

### 4. Build the Project (One-time setup)

Before first use, make sure the project is built:

```bash
cd c:\Repo\noderd_mcp_sse
npm run build
```

### 5. Restart Claude Desktop

1. Close Claude Desktop completely
2. Start Claude Desktop again
3. The server will appear in your integrations

## Verification

Once configured, you should see:
- ✅ "nodered-mcp-server" in Claude's integrations list
- ✅ Node-RED tools available when you click the tools icon
- ✅ Ability to manage Node-RED flows directly from Claude

## Available Tools

After setup, Claude will have access to these Node-RED tools:

### Flow Management
- `list_flows` - List all flows
- `get_flow` - Get specific flow details
- `create_flow` - Create new flow
- `update_flow` - Update existing flow
- `delete_flow` - Delete flow
- `deploy_flows` - Deploy flows to Node-RED

### Node Management  
- `list_node_types` - List available node types
- `get_node_type` - Get node type details
- `install_node` - Install new node package
- `uninstall_node` - Remove node package
- `enable_node` - Enable node type
- `disable_node` - Disable node type

### Runtime Operations
- `get_runtime_info` - Get Node-RED system info
- `health_check` - Check Node-RED connectivity
- `get_context` - Access flow/global/node context

## Troubleshooting

### Server Not Appearing
1. Check that the `cwd` path exists and points to your project
2. Verify Node.js is installed and accessible
3. Make sure the project is built (`npm run build`)
4. Check Claude Desktop logs for errors

### Connection Issues
1. Verify Node-RED URL is accessible
2. Check username/password are correct
3. Ensure Node-RED admin API is enabled

### Finding Logs
**Windows:** `%LOCALAPPDATA%\Claude\logs\`
**macOS:** `~/Library/Logs/Claude/`
**Linux:** `~/.local/share/Claude/logs/`

## Example Usage

Once connected, you can ask Claude things like:
- "List all my Node-RED flows"
- "Create a new flow that reads sensor data"
- "Deploy my flows to Node-RED"
- "Show me the status of my automation flows"
- "Install the node-red-contrib-dashboard package"

The server provides full Node-RED management capabilities directly from Claude!
