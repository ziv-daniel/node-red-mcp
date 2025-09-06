# New Features - MCP Node-RED Server

## Overview

This document describes the new features and fixes added to the MCP Node-RED Server to enhance module management and resolve flow creation issues.

## 🔧 Fixed Issues

### Duplicate ID Issue in Flow Creation

**Problem**: The `create_flow` tool was failing with "duplicate id" errors because it wasn't generating unique IDs for flows and nodes.

**Solution**:

- Added automatic unique ID generation for flows when no ID is provided
- Added automatic unique ID generation for all nodes within flows
- Uses UUID v4 (shortened) to ensure uniqueness
- Prevents duplicate ID conflicts that minimize failed API calls

**Implementation**:

```javascript
// Auto-generates unique flow ID if not provided
const flowToCreate = {
  ...flowData,
  id: flowData.id || this.generateUniqueFlowId(),
  type: flowData.type || 'tab',
};

// Ensures all nodes have unique IDs
const flowWithUniqueIds = this.ensureUniqueNodeIds(flowToCreate);
```

## 🆕 New Tools

### 1. `search_modules`

Search for Node-RED palette modules online via npm registry.

**Parameters**:

- `query` (required): Search query for modules (e.g., "mqtt", "dashboard", "influxdb")
- `category` (optional): Module category - "all", "contrib", "dashboard" (default: "all")
- `limit` (optional): Maximum results to return, 1-50 (default: 10)

**Example Usage**:

```javascript
{
  "name": "search_modules",
  "arguments": {
    "query": "dashboard",
    "category": "contrib",
    "limit": 5
  }
}
```

**Response Format**:

```json
{
  "modules": [
    {
      "name": "node-red-dashboard",
      "version": "3.1.7",
      "description": "Dashboard UI for Node-RED",
      "author": "Node-RED Team",
      "keywords": ["node-red", "dashboard"],
      "repository": "https://github.com/node-red/node-red-dashboard",
      "downloads": 0.95,
      "updated": "2023-06-15T10:30:00.000Z"
    }
  ],
  "total": 1,
  "query": "node-red-contrib dashboard"
}
```

### 2. `install_module`

Install a Node-RED palette module via Node-RED's palette management API.

**Parameters**:

- `moduleName` (required): Name of the module to install (e.g., "node-red-contrib-ui-led")
- `version` (optional): Specific version to install (defaults to latest)

**Example Usage**:

```javascript
{
  "name": "install_module",
  "arguments": {
    "moduleName": "node-red-contrib-ui-led",
    "version": "0.4.11"
  }
}
```

**Response Format**:

```json
{
  "success": true,
  "module": "node-red-contrib-ui-led",
  "version": "0.4.11",
  "message": "Module node-red-contrib-ui-led@0.4.11 installed successfully"
}
```

### 3. `get_installed_modules`

Get a list of currently installed Node-RED palette modules.

**Parameters**: None required

**Example Usage**:

```javascript
{
  "name": "get_installed_modules",
  "arguments": {}
}
```

**Response Format**:

```json
[
  {
    "name": "node-red-dashboard",
    "version": "3.1.7",
    "description": "Module containing ui_button node type"
  },
  {
    "name": "node-red-contrib-ui-led",
    "version": "0.4.11",
    "description": "Module containing ui_led node type"
  }
]
```

## 🚀 Benefits

### For LLM Interactions

1. **Reduced API Calls**: Unique ID generation prevents failed flow creation attempts
2. **Module Discovery**: Can search and discover relevant modules for specific use cases
3. **Dynamic Installation**: Can install required modules during conversation flow
4. **Environment Awareness**: Can check what modules are already available

### For Development Workflow

1. **Automated Module Management**: Search, install, and manage palette modules programmatically
2. **Better Error Prevention**: Unique ID generation prevents common flow creation errors
3. **Enhanced Capabilities**: Can dynamically extend Node-RED functionality as needed

## 🧪 Testing

Run the test suite to verify new functionality:

```bash
node test-new-tools.js
```

The test covers:

- Module searching functionality
- Installed modules retrieval
- Flow creation with unique ID generation
- Tool availability verification

## 🔗 Integration

These tools work seamlessly with existing MCP tools and can be combined for powerful workflows:

1. **Search** for relevant modules
2. **Install** required modules
3. **Create flows** using newly available node types
4. **Monitor** and manage the Node-RED environment

## 📋 Requirements

- Node-RED server must be running and accessible
- Node-RED palette management API must be enabled
- Internet connection required for module searching
- Proper permissions for module installation

## 🔒 Security Considerations

- Module installation requires proper Node-RED permissions
- Validate module sources before installation
- Monitor installed modules for security updates
- Use specific versions when possible for reproducible environments
