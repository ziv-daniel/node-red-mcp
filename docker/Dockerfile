# Use official Node.js runtime as base image
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S mcp -u 1001

# Dependencies stage
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM base AS runner

# Set environment variables
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV PORT=3000

# Copy built application
COPY --from=builder --chown=mcp:nodejs /app/dist ./dist
COPY --from=deps --chown=mcp:nodejs /app/node_modules ./node_modules
COPY --chown=mcp:nodejs config/ ./config/
COPY --chown=mcp:nodejs package*.json ./

# Create necessary directories
RUN mkdir -p logs && chown mcp:nodejs logs

# Switch to non-root user
USER mcp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"] 