#!/bin/sh
set -e

#
# Docker Entrypoint for MCP Node-RED Server
# 2025 Production-Ready Configuration
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    if [ "${LOG_LEVEL}" = "debug" ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Signal handlers for graceful shutdown
shutdown() {
    log_info "Received shutdown signal, stopping MCP server gracefully..."
    
    # Kill child processes
    if [ -n "$MCP_PID" ]; then
        kill -TERM "$MCP_PID" 2>/dev/null || true
        wait "$MCP_PID" 2>/dev/null || true
        log_info "MCP server stopped"
    fi
    
    exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT SIGQUIT

# Print banner
cat << EOF
=====================================
🚀 MCP Node-RED Server
=====================================
Version: ${npm_package_version:-1.0.0}
Environment: ${NODE_ENV:-production}
Transport: ${MCP_TRANSPORT:-stdio}
HTTP Enabled: ${HTTP_ENABLED:-false}
Port: ${PORT:-3000}
=====================================
EOF

# Validate environment
log_info "Validating environment configuration..."

# Check Node.js version
NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"

# Validate required environment variables
if [ -z "$NODE_ENV" ]; then
    log_warn "NODE_ENV not set, defaulting to production"
    export NODE_ENV=production
fi

# Validate MCP transport configuration
case "$MCP_TRANSPORT" in
    stdio|http|both)
        log_info "MCP transport: $MCP_TRANSPORT"
        ;;
    *)
        log_error "Invalid MCP_TRANSPORT: $MCP_TRANSPORT (must be stdio, http, or both)"
        exit 1
        ;;
esac

# Validate HTTP configuration
if [ "$HTTP_ENABLED" = "true" ] || [ "$MCP_TRANSPORT" = "http" ] || [ "$MCP_TRANSPORT" = "both" ]; then
    if [ -z "$PORT" ]; then
        log_warn "PORT not set, defaulting to 3000"
        export PORT=3000
    fi
    
    # Validate port is numeric and in valid range
    if ! echo "$PORT" | grep -qE '^[0-9]+$' || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        log_error "Invalid PORT: $PORT (must be 1-65535)"
        exit 1
    fi
    
    log_info "HTTP server will bind to port: $PORT"
fi

# Validate Node-RED configuration
if [ -n "$NODERED_URL" ]; then
    log_info "Node-RED URL: $NODERED_URL"
    
    # Test Node-RED connectivity
    log_info "Testing Node-RED connectivity..."
    if command -v curl >/dev/null 2>&1; then
        if curl -s --connect-timeout 5 --max-time 10 "$NODERED_URL" >/dev/null 2>&1; then
            log_info "✅ Node-RED is reachable"
        else
            log_warn "⚠️  Node-RED is not reachable (this may be expected during startup)"
        fi
    else
        log_debug "curl not available, skipping connectivity test"
    fi
else
    log_warn "NODERED_URL not configured"
fi

# Security checks
log_info "Performing security checks..."

# Check if running as root (should not be)
if [ "$(id -u)" = "0" ]; then
    log_error "❌ Running as root is not recommended for security reasons"
    if [ "$ALLOW_ROOT" != "true" ]; then
        exit 1
    else
        log_warn "⚠️  ALLOW_ROOT is set, continuing anyway (not recommended)"
    fi
else
    log_info "✅ Running as non-root user ($(id -un))"
fi

# Check file permissions
if [ -f "dist/index.mjs" ]; then
    log_info "✅ Application file found: dist/index.mjs"
else
    log_error "❌ Application file not found: dist/index.mjs"
    exit 1
fi

# Production-specific checks
if [ "$NODE_ENV" = "production" ]; then
    log_info "Production mode checks..."
    
    # Ensure sensitive variables are set
    if [ -z "$JWT_SECRET" ]; then
        log_warn "⚠️  JWT_SECRET not set in production"
    fi
    
    # Check memory limits
    if [ -n "$NODE_OPTIONS" ]; then
        log_info "Node.js options: $NODE_OPTIONS"
    fi
    
    log_info "✅ Production checks completed"
fi

# Development-specific setup
if [ "$NODE_ENV" = "development" ]; then
    log_info "Development mode setup..."
    
    # Enable more verbose logging in development
    if [ -z "$LOG_LEVEL" ]; then
        export LOG_LEVEL=debug
        log_debug "LOG_LEVEL set to debug for development"
    fi
    
    # Development-specific Node options
    if [ -z "$NODE_OPTIONS" ]; then
        export NODE_OPTIONS="--inspect=0.0.0.0:9229"
        log_info "Node.js inspector enabled on port 9229"
    fi
fi

# Create necessary directories with proper permissions
log_debug "Setting up directories..."
mkdir -p logs
mkdir -p temp
mkdir -p data

# Set up log rotation if logrotate is available
if command -v logrotate >/dev/null 2>&1; then
    log_debug "logrotate available for log management"
fi

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check disk space (warn if less than 100MB available)
if command -v df >/dev/null 2>&1; then
    AVAILABLE_KB=$(df /app | tail -1 | awk '{print $4}')
    AVAILABLE_MB=$((AVAILABLE_KB / 1024))
    if [ "$AVAILABLE_MB" -lt 100 ]; then
        log_warn "⚠️  Low disk space: ${AVAILABLE_MB}MB available"
    else
        log_debug "Disk space: ${AVAILABLE_MB}MB available"
    fi
fi

# Check memory (if available)
if [ -f /proc/meminfo ]; then
    AVAILABLE_MB=$(grep MemAvailable /proc/meminfo | awk '{print int($2/1024)}')
    if [ -n "$AVAILABLE_MB" ] && [ "$AVAILABLE_MB" -lt 256 ]; then
        log_warn "⚠️  Low memory: ${AVAILABLE_MB}MB available"
    else
        log_debug "Memory: ${AVAILABLE_MB}MB available"
    fi
fi

log_info "✅ Pre-flight checks completed"

# Handle different execution modes
if [ "$#" -gt 0 ]; then
    case "$1" in
        node)
            # Default application start
            log_info "Starting MCP Node-RED Server..."
            exec "$@" &
            MCP_PID=$!
            ;;
        yarn)
            # Development mode with yarn
            log_info "Starting in development mode with yarn..."
            exec "$@" &
            MCP_PID=$!
            ;;
        sh|bash)
            # Interactive shell
            log_info "Starting interactive shell..."
            exec "$@"
            ;;
        help|--help|-h)
            # Show help
            cat << HELP
MCP Node-RED Server Docker Container

Usage: 
  docker run [options] mcp-nodered-server [command]

Commands:
  node dist/index.mjs  Start the MCP server (default)
  yarn dev            Start in development mode
  sh                  Interactive shell
  help                Show this help

Environment Variables:
  NODE_ENV            Environment (development/production/test)
  MCP_TRANSPORT       Transport mode (stdio/http/both)
  HTTP_ENABLED        Enable HTTP server (true/false)  
  PORT                HTTP server port (default: 3000)
  NODERED_URL         Node-RED instance URL
  NODERED_USERNAME    Node-RED username
  NODERED_PASSWORD    Node-RED password
  JWT_SECRET          JWT secret key
  LOG_LEVEL           Logging level (error/warn/info/debug)

Examples:
  docker run -e NODE_ENV=development mcp-nodered-server
  docker run -e MCP_TRANSPORT=http -e PORT=3001 mcp-nodered-server
  docker run -it mcp-nodered-server sh

For more information, visit: https://github.com/your-org/nodered-mcp
HELP
            exit 0
            ;;
        *)
            # Custom command
            log_info "Executing custom command: $*"
            exec "$@" &
            MCP_PID=$!
            ;;
    esac
else
    # No arguments provided, start with default command
    log_info "Starting MCP Node-RED Server with default configuration..."
    exec node dist/index.mjs &
    MCP_PID=$!
fi

# Wait for the main process and handle signals
if [ -n "$MCP_PID" ]; then
    log_info "🚀 MCP server started (PID: $MCP_PID)"
    log_info "Ready to serve MCP requests"
    
    # Wait for the process to complete
    wait "$MCP_PID"
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        log_info "✅ MCP server exited successfully"
    else
        log_error "❌ MCP server exited with code: $EXIT_CODE"
    fi
    
    exit $EXIT_CODE
fi 