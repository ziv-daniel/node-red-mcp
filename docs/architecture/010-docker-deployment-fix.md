# ADR-010: Docker Deployment Fix for Yarn 4 and Node 22

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: DevOps Team
- **Reviewers**: Tech Lead, Infrastructure Team

## Context

The Docker build is currently disabled in CI/CD due to compatibility issues
between Yarn 4 (Berry) and Node 22 in containerized environments:

### Current Issues
1. **CI/CD Failure**: Docker build job disabled in `.github/workflows/ci.yml`
2. **Yarn 4 Compatibility**: Yarn 4 uses PnP (Plug'n'Play) by default, causing issues
3. **Corepack Integration**: Node 22 includes Corepack but requires proper activation
4. **Build Context**: Multi-stage builds not optimized for Yarn 4 zero-installs
5. **Cache Invalidation**: Poor layer caching leads to slow rebuilds

### Git Commit Reference
```
commit ba30e16
Author: CI/CD
Date: Recent

ci: disable Docker build job due to Yarn 4/Node 22 incompatibility
```

### Requirements
- Support Yarn 4 (Berry) with PnP or node_modules mode
- Node 22 LTS compatibility
- Fast builds with proper layer caching
- Multi-stage builds for minimal production image size
- Support for both development and production builds
- CI/CD integration with GitHub Actions

## Decision

Implement a **multi-stage Docker build** with proper Yarn 4 support using
**nodeLinker: node-modules** mode to ensure compatibility:

### Docker Strategy

**Stage 1: Base**
- Use official Node 22 Alpine image
- Enable Corepack for Yarn 4 management
- Set up non-root user for security

**Stage 2: Dependencies**
- Copy only package.json, yarn.lock, .yarnrc.yml
- Install production dependencies
- Leverage layer caching

**Stage 3: Builder**
- Copy source code
- Run TypeScript build
- Generate production artifacts

**Stage 4: Production**
- Copy only necessary artifacts
- Minimal runtime dependencies
- Non-root user execution

### Yarn 4 Configuration

Use `nodeLinker: node-modules` instead of PnP for Docker compatibility:

```yaml
# .yarnrc.yml
nodeLinker: node-modules
enableGlobalCache: false
```

### Build Optimizations
- Multi-stage builds reduce final image size
- Layer caching for dependencies
- .dockerignore to exclude unnecessary files
- Build artifacts cached in GitHub Actions

## Rationale

### Why node-modules Mode?
- **Compatibility**: Works better in Docker without PnP complexity
- **Simpler**: No need for PnP loader in container
- **Predictable**: Standard node_modules resolution
- **Debugging**: Easier to inspect dependencies
- **Third-party**: Better compatibility with native modules

### Why Alpine Linux?
- **Size**: ~5MB base vs ~150MB for full Debian
- **Security**: Smaller attack surface
- **Performance**: Faster image pulls and deployments
- **Standard**: Common choice for Node.js containers

### Why Multi-stage Builds?
- **Size Reduction**: Dev dependencies not in production image
- **Security**: Build tools not in runtime image
- **Speed**: Parallel stage execution
- **Clarity**: Clear separation of concerns

### Why Corepack?
- **Official**: Built into Node 22
- **Version Management**: Ensures correct Yarn version
- **Automatic**: No manual Yarn installation needed
- **Standard**: Recommended by Node.js team

## Alternatives Considered

### Alternative 1: Stick with Yarn 3
**Pros**:
- Might have fewer compatibility issues
- Known working configuration

**Cons**:
- Missing Yarn 4 features
- Going backwards in versions
- Yarn 4 already in use locally

**Verdict**: ❌ Rejected - Regression, not a solution

### Alternative 2: Use PnP Mode in Docker
**Pros**:
- Faster installs
- Disk space savings
- "Pure" Yarn 4 experience

**Cons**:
- Complex PnP setup in Docker
- Compatibility issues with some packages
- Harder debugging
- Not all tools support PnP

**Verdict**: ❌ Rejected - Too complex for containers

### Alternative 3: Use npm Instead
**Pros**:
- Simpler Docker setup
- More familiar to some developers
- Native to Node.js

**Cons**:
- Lose Yarn 4 benefits (workspaces, constraints)
- Migration effort required
- Slower than Yarn 4
- ADR-007 already accepted Yarn 4 migration

**Verdict**: ❌ Rejected - Contradicts ADR-007

### Alternative 4: Use BuildKit with PnP
**Pros**:
- Modern Docker features
- Better caching
- Keep PnP benefits

**Cons**:
- Requires BuildKit everywhere (CI/CD, local)
- More complex configuration
- PnP still has compatibility issues

**Verdict**: ❌ Rejected - Complexity not worth it

## Consequences

### Positive
- ✅ **Working Builds**: Docker builds succeed in CI/CD
- ✅ **Fast Rebuilds**: Layer caching optimized
- ✅ **Small Images**: Multi-stage builds reduce size
- ✅ **Security**: Non-root user, minimal attack surface
- ✅ **Compatibility**: node-modules mode widely supported
- ✅ **Yarn 4 Benefits**: Keep workspace features
- ✅ **Reproducible**: Locked dependencies with yarn.lock

### Negative
- ⚠️ **Disk Space**: node_modules larger than PnP
- ⚠️ **Install Speed**: Slightly slower than PnP mode
- ⚠️ **Configuration Change**: Need to update .yarnrc.yml
- ⚠️ **Local Difference**: Local dev might use PnP, Docker uses node_modules
- ⚠️ **Cache Size**: Docker layer cache can grow large

### Mitigation Strategies
- Use .dockerignore to exclude unnecessary files
- Implement cache pruning in CI/CD
- Document both PnP and node-modules workflows
- Consider using same mode locally and in Docker for consistency
- Monitor image sizes and optimize as needed

## Implementation Notes

### New Dockerfile

```dockerfile
# Stage 1: Base image with Node 22 and Corepack
FROM node:22-alpine AS base

# Enable Corepack for Yarn 4
RUN corepack enable && corepack prepare yarn@4.9.4 --activate

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Stage 2: Install dependencies
FROM base AS dependencies

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies
RUN yarn install --immutable

# Stage 3: Build application
FROM base AS builder

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Stage 4: Production image
FROM base AS production

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "dist/index.js"]
```

### Updated .yarnrc.yml

```yaml
nodeLinker: node-modules
enableGlobalCache: false
compressionLevel: mixed
nmMode: hardlinks-local
```

### Enhanced .dockerignore

```
# Dependencies
node_modules
.pnp.*

# Build artifacts
dist
coverage

# Development files
*.log
.env
.env.*
!.env.example

# Version control
.git
.gitignore

# IDE
.vscode
.idea
*.swp

# OS
.DS_Store
Thumbs.db

# Documentation
*.md
!README.md

# Tests
test
e2e
coverage
*.test.ts
*.spec.ts
```

### CI/CD Update

```yaml
# .github/workflows/ci.yml
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          tags: mcp-nodered-server:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Test Docker image
        run: |
          docker run -d -p 3000:3000 --name test-container mcp-nodered-server:${{ github.sha }}
          sleep 10
          curl -f http://localhost:3000/health || exit 1
          docker stop test-container
```

### docker-compose.yml Update

```yaml
version: '3.8'

services:
  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NODERED_URL=${NODERED_URL}
      - NODERED_USERNAME=${NODERED_USERNAME}
      - NODERED_PASSWORD=${NODERED_PASSWORD}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 40s
    restart: unless-stopped
```

### Build Commands

```bash
# Local development build
docker build -t mcp-nodered-server:dev .

# Production build
docker build -t mcp-nodered-server:latest --target production .

# Test the image
docker run -p 3000:3000 --env-file .env mcp-nodered-server:latest

# Using docker-compose
docker-compose up --build
```

### Verification Steps

1. **Build succeeds**: `docker build` completes without errors
2. **Image size**: Production image < 200MB
3. **Container starts**: Application starts and responds to health checks
4. **Functionality**: MCP tools work correctly in container
5. **Security**: Non-root user, no vulnerabilities in base image

## Related ADRs

- [ADR-007: Package Manager Migration to Yarn 4](./007-package-manager-migration.md) - Yarn 4 adoption decision
- [ADR-002: TypeScript Build System](./002-typescript-build-system.md) - Build process affects Docker
- [ADR-006: Containerization and Deployment Strategy](./006-containerization-strategy.md) - Overall deployment approach

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Yarn 4 Documentation](https://yarnpkg.com/getting-started/install)
- [Corepack Documentation](https://nodejs.org/api/corepack.html)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
