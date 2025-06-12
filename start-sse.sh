#!/bin/bash

# Set environment variables for SSE mode
export MCP_TRANSPORT=http
export HTTP_ENABLED=true
export PORT=3000
export NODE_ENV=production

# Optional: Configure Node-RED connection
export NODERED_URL=https://nodered.danielshaprvt.work
export NODERED_USERNAME=zivdaniel12
export NODERED_PASSWORD=Z5877029

# SSE Configuration
export SSE_ENABLED=true
export SSE_HEARTBEAT_INTERVAL=30000
export SSE_MAX_CONNECTIONS=100

# Security settings
export CORS_ORIGIN=*
export CORS_CREDENTIALS=true

# Optional: Add API key for authentication
export API_KEY=your-api-key-for-claude

echo "Starting MCP Node-RED Server with SSE support..."
echo "SSE Endpoint will be available at: http://localhost:3000/api/events"
echo "Health check: http://localhost:3000/health"

node dist/index.js 