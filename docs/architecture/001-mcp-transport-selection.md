# ADR-001: MCP Transport Layer Selection

- **Status**: Accepted
- **Date**: 2024-12-17
- **Authors**: MCP Node-RED Server Team
- **Reviewers**: Architecture Review Board

## Context

The Model Context Protocol (MCP) specification supports multiple transport
mechanisms for communication between clients and servers. Our Node-RED MCP
server needs to choose appropriate transport methods to support various use
cases:

1. **Claude Desktop Integration**: Requires stdio transport for MCP client
   integration
2. **HTTP API Access**: Needed for testing, debugging, and web-based
   integrations
3. **Production Scalability**: Must support multiple concurrent connections
4. **Development Experience**: Should provide easy testing and debugging
   capabilities

The MCP specification defines several transport options:

- **stdio**: Standard input/output communication (required for Claude Desktop)
- **HTTP**: RESTful HTTP-based communication
- **WebSocket**: Real-time bidirectional communication
- **SSE**: Server-Sent Events for real-time updates

## Decision

We decided to implement a **dual transport architecture** supporting both stdio
and HTTP transports:

1. **Primary**: stdio transport for MCP protocol compliance and Claude Desktop
   integration
2. **Secondary**: HTTP transport with additional REST API endpoints for broader
   accessibility
3. **Enhancement**: Server-Sent Events (SSE) for real-time updates and
   monitoring
4. **Future**: WebSocket support can be added later if needed

The implementation provides:

- stdio transport as default (`MCP_TRANSPORT=stdio`)
- HTTP transport as optional (`HTTP_ENABLED=true`)
- Combined mode supporting both simultaneously
- SSE endpoint (`/api/events`) for real-time notifications

## Rationale

This decision balances multiple requirements:

1. **MCP Compliance**: stdio transport ensures full compatibility with Claude
   Desktop and other MCP clients
2. **Developer Experience**: HTTP endpoints enable easy testing with curl,
   Postman, and browser-based tools
3. **Monitoring & Debugging**: SSE provides real-time visibility into server
   operations
4. **Scalability**: HTTP transport can handle multiple concurrent connections
   more efficiently than stdio
5. **Flexibility**: Dual transport allows different integration patterns for
   different use cases

## Alternatives Considered

### Single stdio Transport

- **Pros**: Simpler implementation, full MCP compliance
- **Cons**: Limited debugging capabilities, no web integration, poor developer
  experience

### HTTP-Only Transport

- **Pros**: Great developer experience, web-friendly, scalable
- **Cons**: Not compatible with Claude Desktop, deviation from MCP standard

### WebSocket Primary

- **Pros**: Real-time bidirectional communication, efficient
- **Cons**: More complex implementation, not required by MCP spec initially

### Universal Transport Abstraction

- **Pros**: Could support any transport protocol
- **Cons**: Over-engineering, increased complexity, delayed delivery

## Consequences

### Positive

- **MCP Compliance**: Full compatibility with Claude Desktop and MCP ecosystem
- **Developer Experience**: Easy testing and debugging via HTTP endpoints
- **Monitoring**: Real-time visibility into server operations via SSE
- **Scalability**: HTTP transport supports multiple concurrent clients
- **Flexibility**: Can integrate with web applications, monitoring tools, and
  APIs
- **Testing**: Comprehensive E2E testing possible with both transport types

### Negative

- **Complexity**: Must maintain two transport implementations
- **Resource Usage**: HTTP server adds memory and CPU overhead when enabled
- **Configuration**: Additional environment variables and configuration options
- **Testing**: More test scenarios to cover both transport methods

## Implementation Notes

1. **Configuration**: Use `MCP_TRANSPORT` environment variable with values
   `stdio`, `http`, or `both`
2. **Default**: stdio mode for maximum MCP compatibility
3. **HTTP Mode**: Only enabled when `HTTP_ENABLED=true` is set
4. **Port Configuration**: HTTP server uses `PORT` environment variable
   (default: 3000)
5. **Security**: HTTP mode includes JWT authentication, CORS, and rate limiting
6. **Monitoring**: Both transports are instrumented with metrics and logging

### Code Organization

```
src/
├── server/
│   ├── mcp-server.ts          # Main MCP server class
│   ├── stdio-transport.ts     # stdio transport implementation
│   ├── http-transport.ts      # HTTP transport implementation
│   └── sse-handler.ts         # Server-Sent Events handler
```

## Related ADRs

- [ADR-003: Comprehensive Testing Strategy](./003-testing-strategy.md) - Testing
  both transport methods
- [ADR-005: Security Architecture and Validation](./005-security-architecture.md) -
  HTTP transport security

## References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Express.js Documentation](https://expressjs.com/)

---

_Created: 2024-12-17 | Last Updated: 2024-12-17_
