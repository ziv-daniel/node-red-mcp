# syntax=docker/dockerfile:1.7

#
# Node-RED MCP Server - Multi-stage Docker build
# 2025 Security & Performance Optimized
#

ARG NODE_VERSION=22
ARG YARN_VERSION=4.9.4
ARG ALPINE_VERSION=3.19

# ============================================================================
# Stage 1: Base image with security updates
# ============================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# Install security updates and essential packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        curl \
        ca-certificates \
        tzdata && \
    rm -rf /var/cache/apk/*

# Enable Corepack for modern package management
RUN corepack enable

# Create non-root user for security
RUN addgroup -g 1001 -S mcpserver && \
    adduser -S mcpserver -u 1001 -G mcpserver -h /app -s /bin/sh

# Set working directory
WORKDIR /app

# Change ownership to non-root user
RUN chown -R mcpserver:mcpserver /app

# ============================================================================
# Stage 2: Dependencies installation
# ============================================================================
FROM base AS dependencies

# Switch to non-root user
USER mcpserver

# Copy package management files
COPY --chown=mcpserver:mcpserver package.json yarn.lock .yarnrc.yml ./

# Install dependencies with optimizations
ENV YARN_CACHE_FOLDER=/tmp/yarn-cache
RUN yarn install --immutable --network-timeout 300000 && \
    yarn cache clean && \
    rm -rf /tmp/yarn-cache

# ============================================================================
# Stage 3: Build stage
# ============================================================================
FROM dependencies AS builder

# Copy source code
COPY --chown=mcpserver:mcpserver . .

# Build the application
RUN yarn build:prod

# Remove development dependencies to reduce size
RUN yarn workspaces focus --production && \
    yarn cache clean

# ============================================================================
# Stage 4: Production image
# ============================================================================
FROM base AS production

# Install production runtime dependencies only
RUN apk add --no-cache \
        tini && \
    rm -rf /var/cache/apk/*

# Set production environment
ENV NODE_ENV=production
ENV MCP_TRANSPORT=stdio
ENV HTTP_ENABLED=false
ENV PORT=3000

# Health check configuration
ENV HEALTH_CHECK_INTERVAL=30000
ENV HEALTH_CHECK_TIMEOUT=5000

# Switch to non-root user
USER mcpserver

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=mcpserver:mcpserver /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=mcpserver:mcpserver /app/dist ./dist
COPY --from=builder --chown=mcpserver:mcpserver /app/package.json ./

# Copy configuration files
COPY --chown=mcpserver:mcpserver docker/docker-entrypoint.sh /usr/local/bin/
COPY --chown=mcpserver:mcpserver flows/ ./flows/

# Make entrypoint executable
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER mcpserver

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Security: Run as non-root user
USER mcpserver

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Default command
CMD ["node", "dist/index.mjs"]

# ============================================================================
# Labels for metadata (OCI compliant)
# ============================================================================
LABEL org.opencontainers.image.title="MCP Node-RED Server"
LABEL org.opencontainers.image.description="Model Context Protocol server for Node-RED integration"
LABEL org.opencontainers.image.vendor="MCP Node-RED Server"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/your-org/nodered-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/your-org/nodered-mcp#readme"

# Security and maintenance labels
LABEL maintainer="your-email@example.com"
LABEL security.contact="security@example.com"
LABEL org.opencontainers.image.created="2024-12-17"
LABEL org.opencontainers.image.revision="main"

# ============================================================================
# Alternative: Development image
# ============================================================================
FROM dependencies AS development

# Switch to root to install development tools
USER root

# Install development tools
RUN apk add --no-cache \
        git \
        openssh-client && \
    rm -rf /var/cache/apk/*

# Switch back to non-root user
USER mcpserver

# Copy source code
COPY --chown=mcpserver:mcpserver . .

# Set development environment
ENV NODE_ENV=development
ENV LOG_LEVEL=debug
ENV MCP_TRANSPORT=both
ENV HTTP_ENABLED=true

# Expose additional ports for development
EXPOSE 3000 9229

# Development command with hot reload
CMD ["yarn", "dev"] 