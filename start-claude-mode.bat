@echo off
REM Start MCP Node-RED Server in Claude-compatible mode for Windows

echo 🚀 Starting MCP Node-RED Server with Claude.ai integration support...

REM Set Claude-compatible environment variables
set MCP_TRANSPORT=http
set HTTP_ENABLED=true
set PORT=3001

REM Claude Integration Settings
set CLAUDE_AUTH_REQUIRED=false
set CLAUDE_COMPATIBLE_MODE=true
set DEBUG_CLAUDE_CONNECTIONS=true
set ACCEPT_ANY_BEARER_TOKEN=true
set AUTH_FALLBACK_ENABLED=true

REM Node-RED Configuration (update these with your Node-RED instance)
set NODERED_URL=https://nodered.danielshaprvt.work
set NODERED_USERNAME=zivdaniel12
set NODERED_PASSWORD=Z5877029

REM SSE Configuration
set SSE_ENABLED=true
set SSE_HEARTBEAT_INTERVAL=30000
set SSE_MAX_CONNECTIONS=100

REM CORS Configuration
set CORS_ORIGIN=*
set CORS_CREDENTIALS=true

echo 📊 Claude Integration Configuration:
echo   - Authentication Required: %CLAUDE_AUTH_REQUIRED%
echo   - Claude Compatible Mode: %CLAUDE_COMPATIBLE_MODE%
echo   - Debug Connections: %DEBUG_CLAUDE_CONNECTIONS%
echo   - Accept Any Bearer Token: %ACCEPT_ANY_BEARER_TOKEN%
echo   - Auth Fallback Enabled: %AUTH_FALLBACK_ENABLED%
echo.
echo 🔗 Endpoints for Claude integration:
echo   - SSE: http://localhost:3001/sse
echo   - Discovery: http://localhost:3001/.well-known/mcp-server
echo   - Debug: http://localhost:3001/debug/claude-connection
echo   - Health: http://localhost:3001/health
echo.
echo 📝 Starting server...

node dist/index.js
