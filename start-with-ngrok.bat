@echo off
echo Starting MCP Node-RED SSE Server with ngrok...

REM Set environment variables
set MCP_TRANSPORT=http
set HTTP_ENABLED=true
set PORT=3000
set NODE_ENV=development

echo Starting SSE server on port 3000...
start /B "MCP-SSE-Server" node dist/index.js

echo Waiting for server to start...
timeout /t 5 /nobreak

echo Testing server connection...
curl http://localhost:3000/ping 2>nul
if %errorlevel% neq 0 (
    echo Server not responding. Check logs.
    pause
    exit /b 1
)

echo Server is running! Starting ngrok tunnel...
echo Starting ngrok on port 3000...
ngrok http 3000 