# Project Brief: MCP Node-RED SSE Integration Server

## Core Mission
Build a comprehensive **Model Context Protocol (MCP)** server that provides seamless Node-RED integration with real-time Server-Sent Events (SSE) support for flow monitoring and management.

## Primary Goals
1. **MCP Protocol Implementation**: Full compliance with Model Context Protocol standards
2. **Node-RED Integration**: Complete CRUD operations on flows, nodes, and runtime management
3. **Real-time Monitoring**: SSE-based live streaming of flow status and events
4. **Production Ready**: Secure, scalable, and robust server implementation

## Key Requirements

### Functional Requirements
- **Flow Management**: Create, read, update, delete, enable/disable, deploy Node-RED flows
- **Node Management**: Install/uninstall modules, enable/disable node types
- **Runtime Monitoring**: System info, health checks, context management
- **Real-time Events**: Live flow status, node events, errors via SSE
- **MCP Compliance**: Standard tools, resources, and prompts implementation

### Technical Requirements
- **TypeScript**: Full type safety and modern development practices
- **Multiple Transports**: Support stdio, HTTP, and combined transport modes
- **Authentication**: JWT and API key security
- **Error Handling**: Comprehensive error management and logging
- **Testing**: Unit and integration test coverage
- **Docker Support**: Containerized deployment option

### Quality Standards
- **Security**: Secure authentication, CORS, rate limiting, input validation
- **Performance**: Efficient SSE connections, optimized Node-RED API calls
- **Reliability**: Robust error handling, connection management, retry logic
- **Maintainability**: Clean architecture, comprehensive documentation, testing

## Success Criteria
1. ✅ **Basic MCP Server**: Working stdio transport with core tools
2. ✅ **Node-RED Integration**: Full API client with flow/node management
3. 🔄 **SSE Implementation**: Real-time event streaming (in progress)
4. 🔄 **Security Layer**: Authentication and authorization (in progress)
5. ⏳ **Production Features**: Docker, logging, monitoring, testing
6. ⏳ **Documentation**: Complete API docs, usage guides, deployment guides

## Project Scope

### In Scope
- Core MCP server functionality
- Complete Node-RED Admin API integration
- Real-time SSE event streaming
- Security and authentication
- Production deployment features
- Comprehensive testing and documentation

### Out of Scope
- Node-RED core modifications
- Custom node development
- Web UI/dashboard (focus on API/protocol)
- Advanced analytics or reporting features
- Multi-tenancy or user management

## Timeline & Phases
- **Phase 1**: Foundation Setup (Complete)
- **Phase 2**: Node-RED API Integration (Complete)
- **Phase 3**: MCP Tools Implementation (In Progress)
- **Phase 4**: SSE Real-time Features (In Progress)
- **Phase 5**: Security & Authentication (Planned)
- **Phase 6**: Production Features (Planned)

This project represents a critical bridge between AI model interactions (via MCP) and Node-RED automation capabilities, enabling AI agents to directly manage and monitor Node-RED flows in real-time.
