# Changelog

All notable changes to the MCP Node-RED Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-11-22

### Added
- **MCP SDK 1.22.0 Upgrade**: Updated from 1.17.5 to latest SDK version with protocol improvements
- **Circuit Breaker Pattern**: Implemented comprehensive circuit breaker for Node-RED API calls
  - Configurable failure threshold (default: 5 failures)
  - Configurable success threshold for recovery (default: 2 successes)
  - Automatic state transitions (closed → open → half-open → closed)
  - Real-time state change monitoring
- **Exponential Backoff Retry Logic**: Smart retry mechanism with:
  - Configurable max retries (default: 3)
  - Exponential backoff with configurable multiplier (default: 2x)
  - Max delay caps to prevent excessive waits
  - Smart retry predicates (skip 4xx errors except 429 rate limits)
  - Detailed retry attempt logging
- **Server Discovery Endpoint**: Implemented `.well-known/mcp.json` per November 2025 MCP spec
  - Exposes server capabilities and metadata
  - Lists available tools, resources, and prompts
  - Provides endpoint information for HTTP and SSE
  - Includes vendor and documentation links
  - Enables MCP registry integration
- **Timeout Management**: Comprehensive timeout handling with proper cleanup
  - Request-level timeouts
  - Operation-level timeouts
  - Race condition prevention
- **Enhanced Error Handling**: Production-ready error management
  - Custom error classes with proper inheritance
  - Standardized error responses
  - Request correlation IDs
  - Context-aware error logging
- **Test Coverage**: Added 19 comprehensive tests for retry and circuit breaker
  - Unit tests for exponential backoff
  - Circuit breaker state transition tests
  - Timeout handling tests
  - Integration tests for retry with circuit breaker

### Fixed
- **TypeScript Strict Mode Compliance**: Resolved all `exactOptionalPropertyTypes` errors
  - Fixed SSEConnection, SSEClientInfo, SSEError type definitions
  - Fixed ApiResponse and LogEntry optional properties
  - Fixed ModuleInstallResult version field
  - Fixed error handling class optional properties
- **Undefined Function Reference**: Removed undefined `logFunction` call in mcp-server.ts
- **OpenTelemetry Resource Import**: Fixed Resource import to prevent runtime errors
- **Pino Logger Signature**: Corrected logger.info parameter order (metadata first, message second)
- **Method Visibility**: Made MCP server methods public for testing accessibility

### Changed
- **Node-RED API Client**: Enhanced with circuit breaker and retry logic
  - All API calls now protected by circuit breaker
  - Automatic retry with exponential backoff
  - Improved resilience against transient failures
- **Build System**: Verified all builds succeed with strict TypeScript checking
- **Documentation**: Updated README with 2025 reliability features

### Technical Details

#### Retry Implementation
```typescript
- Initial delay: 1000ms
- Max delay: 10000ms
- Backoff multiplier: 2x
- Max retries: 3 (configurable)
- Smart retry logic: Skip 4xx errors except 429
```

#### Circuit Breaker Configuration
```typescript
- Failure threshold: 5 consecutive failures
- Success threshold: 2 consecutive successes (in half-open state)
- Timeout: 60000ms (1 minute)
- State monitoring with callbacks
```

#### Server Discovery Format
```json
{
  "name": "nodered-mcp-server",
  "version": "1.0.0",
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": {}, "resources": {}, "prompts": {} },
  "endpoints": { "http": {...}, "sse": {...} }
}
```

### Migration Notes
- No breaking changes in this release
- All existing MCP tool APIs remain compatible
- Circuit breaker is transparent to clients
- Server discovery endpoint is opt-in for discovery

### References
- [MCP November 2025 Protocol Updates](https://modelcontextprotocol.io/development/roadmap)
- [MCP SDK 1.22.0 Release](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff Strategy](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

## [1.0.0] - 2025-06-12

### Initial Release
- Basic MCP server implementation with stdio transport
- Node-RED Admin API integration
- SSE support for real-time monitoring
- Tool, resource, and prompt implementations
- Express HTTP server with security middleware
- TypeScript 5.7+ with strict mode
- Comprehensive test framework setup
