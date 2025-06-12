@echo off
REM Set environment variables for SSE mode
set MCP_TRANSPORT=http
set HTTP_ENABLED=true
set PORT=3000
set NODE_ENV=production

REM Configure Node-RED connection
set NODERED_URL=https://nodered.danielshaprvt.work
set NODERED_USERNAME=zivdaniel12
set NODERED_PASSWORD=Z5877029

REM SSE Configuration
set SSE_ENABLED=true
set SSE_HEARTBEAT_INTERVAL=30000
set SSE_MAX_CONNECTIONS=100

REM Security settings
set CORS_ORIGIN=*
set CORS_CREDENTIALS=true

REM Optional: Add API key for authentication
set API_KEY=your-api-key-for-claude

echo Starting MCP Node-RED Server with SSE support...
echo SSE Endpoint will be available at: http://localhost:3000/api/events
echo Health check: http://localhost:3000/health
echo.

node dist/index.js 