#!/bin/bash

# Start MCP Node-RED Server in Claude-compatible mode
echo "🚀 Starting MCP Node-RED Server with Claude.ai integration support..."

# Set Claude-compatible environment variables
export MCP_TRANSPORT=http
export HTTP_ENABLED=true
export PORT=3000

# Claude Integration Settings
export CLAUDE_AUTH_REQUIRED=false
export CLAUDE_COMPATIBLE_MODE=true
export DEBUG_CLAUDE_CONNECTIONS=true
export ACCEPT_ANY_BEARER_TOKEN=true
export AUTH_FALLBACK_ENABLED=true

# Node-RED Configuration (update these with your Node-RED instance)
export NODERED_URL=https://nodered.danielshaprvt.work
export NODERED_USERNAME=zivdaniel12
export NODERED_PASSWORD=Z5877029

# SSE Configuration
export SSE_ENABLED=true
export SSE_HEARTBEAT_INTERVAL=30000
export SSE_MAX_CONNECTIONS=100

# CORS Configuration
export CORS_ORIGIN=*
export CORS_CREDENTIALS=true

echo "📊 Claude Integration Configuration:"
echo "  - Authentication Required: $CLAUDE_AUTH_REQUIRED"
echo "  - Claude Compatible Mode: $CLAUDE_COMPATIBLE_MODE"
echo "  - Debug Connections: $DEBUG_CLAUDE_CONNECTIONS"
echo "  - Accept Any Bearer Token: $ACCEPT_ANY_BEARER_TOKEN"
echo "  - Auth Fallback Enabled: $AUTH_FALLBACK_ENABLED"
echo ""
echo "🔗 Endpoints for Claude integration:"
echo "  - SSE: http://localhost:3000/sse"
echo "  - Discovery: http://localhost:3000/.well-known/mcp-server"
echo "  - Debug: http://localhost:3000/debug/claude-connection"
echo "  - Health: http://localhost:3000/health"
echo ""
echo "📝 Starting server..."

node dist/index.js
