# ADR-014: API Documentation Strategy

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: Development Team, Technical Writing Team
- **Reviewers**: Tech Lead, Product Manager

## Context

The project lacks comprehensive API documentation for the 20+ MCP tools and HTTP
endpoints, making it difficult for users to understand capabilities and integrate
with the server:

### Current Documentation State
- ✅ **README**: Basic overview and quick start
- ✅ **ADRs**: Architectural decisions documented
- ⏳ **API Reference**: Incomplete tool documentation
- ⏳ **Usage Examples**: Few code examples
- ⏳ **Integration Guides**: Missing integration patterns
- ⏳ **OpenAPI Spec**: Partially defined in docs/api/openapi.yaml

### Documentation Needs
1. **MCP Tools**: All 20+ tools with parameters, responses, examples
2. **HTTP API**: REST endpoints for HTTP transport mode
3. **SSE Events**: Event types, formats, subscription patterns
4. **Authentication**: Setup guides for JWT and API keys
5. **Integration Examples**: Claude Desktop, API clients, webhooks
6. **Error Handling**: Error codes, meanings, recovery
7. **Best Practices**: Common patterns and anti-patterns

### Target Audiences
- **AI Model Users**: Using through Claude Desktop (MCP tools)
- **Developers**: Integrating via HTTP API
- **System Admins**: Deploying and configuring
- **Contributors**: Understanding codebase

## Decision

Implement comprehensive, multi-format documentation with **OpenAPI specification**,
**interactive playground**, **code examples**, and **integration guides**:

### Documentation Architecture

```
docs/
├── architecture/           # ADRs (already exists)
├── api/
│   ├── openapi.yaml       # OpenAPI 3.1 specification
│   ├── mcp-tools.md       # MCP tool reference
│   ├── events.md          # SSE event reference
│   └── errors.md          # Error codes and handling
├── guides/
│   ├── getting-started.md
│   ├── authentication.md
│   ├── claude-desktop.md
│   ├── http-integration.md
│   └── deployment.md
├── examples/
│   ├── nodejs/            # Node.js client examples
│   ├── python/            # Python client examples
│   ├── curl/              # curl examples
│   └── postman/           # Postman collection
└── contributing/
    ├── development.md
    ├── testing.md
    └── code-style.md
```

### Documentation Formats

**1. OpenAPI Specification** (Machine-readable)
- Complete API specification in openapi.yaml
- Used for code generation, validation, API client generation
- Powers interactive documentation (Swagger UI / Redoc)

**2. Markdown Documentation** (Human-readable)
- API reference with descriptions and examples
- Integration guides and tutorials
- Searchable, version-controlled

**3. Interactive Playground** (Hands-on)
- Swagger UI or Redoc for HTTP API
- Live API testing directly in browser
- No code required to explore

**4. Code Examples** (Copy-paste ready)
- Multiple languages (Node.js, Python, curl)
- Common workflows and patterns
- Runnable examples in repository

### Documentation Tooling

**Documentation Generator**: Use TypeDoc for TypeScript code
**API Explorer**: Swagger UI or Redoc for OpenAPI
**Version Control**: Git for all documentation
**Automation**: Generate docs from code where possible
**Search**: Use GitHub search or Algolia DocSearch

## Rationale

### Why OpenAPI?
- **Standard**: Industry-standard API specification format
- **Tooling**: Excellent ecosystem (codegen, validation, UI)
- **Machine-Readable**: Enables code generation and validation
- **Interactive**: Powers Swagger UI and Redoc
- **Contract**: Serves as API contract

### Why Multiple Formats?
- **OpenAPI**: For tools and API clients
- **Markdown**: For human readers and GitHub integration
- **Examples**: For quick start and copy-paste
- **Different Audiences**: Different preferences and needs

### Why Interactive Playground?
- **Try Before Use**: Test API without writing code
- **Learning**: Understand API by experimenting
- **Debugging**: Test requests and see responses
- **Discovery**: Explore capabilities interactively

### Why Examples Repository?
- **Quick Start**: Get running immediately
- **Best Practices**: Show recommended patterns
- **Reference**: Real working code to learn from
- **Testing**: Examples serve as integration tests

## Alternatives Considered

### Alternative 1: Code Comments Only
**Pros**:
- Minimal effort
- Close to code

**Cons**:
- Not discoverable
- No user-facing docs
- Hard to maintain
- No interactive exploration

**Verdict**: ❌ Rejected - Insufficient for users

### Alternative 2: Wiki or Confluence
**Pros**:
- Easy to edit
- Rich formatting
- Collaborative

**Cons**:
- Not version-controlled with code
- Gets outdated quickly
- No code review for docs
- Separate from codebase

**Verdict**: ❌ Rejected - Docs should live with code

### Alternative 3: Custom Documentation Site
**Pros**:
- Full control over design
- Custom features
- Beautiful presentation

**Cons**:
- Significant development effort
- Maintenance burden
- Unnecessary complexity
- Standard tools work fine

**Verdict**: ❌ Rejected - Overengineering

### Alternative 4: GraphQL Schema + Playground
**Pros**:
- Self-documenting
- Great tooling (GraphiQL)
- Type-safe

**Cons**:
- Requires GraphQL adoption
- Not RESTful (current design)
- Major architectural change
- Overkill for current needs

**Verdict**: ❌ Rejected - Wrong technology choice

## Consequences

### Positive
- ✅ **Discoverability**: Users can find and understand tools
- ✅ **Adoption**: Lower barrier to integration
- ✅ **Reduced Support**: Self-service documentation
- ✅ **Quality**: Documentation forces API design review
- ✅ **Testing**: Examples serve as integration tests
- ✅ **Onboarding**: Faster developer onboarding
- ✅ **Standard**: OpenAPI enables ecosystem tooling

### Negative
- ⚠️ **Maintenance**: Documentation requires ongoing updates
- ⚠️ **Initial Effort**: Significant work to create comprehensive docs
- ⚠️ **Sync Risk**: Docs can drift from implementation
- ⚠️ **Review Overhead**: Docs should be reviewed like code
- ⚠️ **Hosting**: Interactive docs need web hosting

### Mitigation Strategies
- Automate doc generation from code where possible
- Include doc updates in PR checklist
- CI/CD checks for OpenAPI validation
- Documentation as part of Definition of Done
- Regular doc review cycles

## Implementation Notes

### Phase 1: OpenAPI Specification (Week 1)

```yaml
# docs/api/openapi.yaml
openapi: 3.1.0
info:
  title: MCP Node-RED Server API
  version: 1.0.0
  description: |
    Model Context Protocol server for Node-RED integration with
    real-time SSE support for flow monitoring and management.
  contact:
    name: API Support
    url: https://github.com/ziv-daniel/node-red-mcp
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: http://localhost:3000
    description: Development server
  - url: https://api.example.com
    description: Production server

paths:
  /api/tools/get_flows:
    post:
      summary: Get Node-RED flows
      operationId: getFlows
      tags: [Flows]
      security:
        - bearerAuth: []
        - apiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                includeDetails:
                  type: boolean
                  default: false
                  description: Include full node details or just summary
                types:
                  type: array
                  items:
                    type: string
                    enum: [tab, subflow]
                  default: [tab, subflow]
                  description: Flow types to include
            examples:
              summary:
                summary: Get flow summary
                value:
                  includeDetails: false
              full:
                summary: Get full flow details
                value:
                  includeDetails: true
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FlowsResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '503':
          $ref: '#/components/responses/ServiceUnavailable'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    FlowsResponse:
      type: object
      properties:
        flows:
          type: array
          items:
            $ref: '#/components/schemas/Flow'
        mode:
          type: string
          enum: [live, cached]
        cacheAge:
          type: number

    Flow:
      type: object
      properties:
        id:
          type: string
        label:
          type: string
        type:
          type: string
          enum: [tab, subflow]
        disabled:
          type: boolean

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    ServiceUnavailable:
      description: Service temporarily unavailable
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```

### Phase 2: MCP Tools Documentation (Week 1)

```markdown
# docs/api/mcp-tools.md

# MCP Tools Reference

## get_flows

Get list of Node-RED flows with optional details.

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `includeDetails` | boolean | No | `false` | Include full node details |
| `types` | string[] | No | `["tab", "subflow"]` | Flow types to filter |

### Response

```typescript
{
  flows: Flow[];
  mode?: 'live' | 'cached';
  cacheAge?: number;
}
```

### Example

```javascript
// Using MCP SDK
const result = await client.callTool('get_flows', {
  includeDetails: false,
  types: ['tab']
});

console.log(result.flows);
```

### Error Codes

- `NODERED_CONNECTION_FAILED` - Cannot connect to Node-RED
- `UNAUTHORIZED` - Authentication required
- `INVALID_PARAMETERS` - Invalid tool parameters

---

## create_flow

Create a new Node-RED flow.

[... detailed documentation for each tool ...]
```

### Phase 3: Integration Guides (Week 2)

```markdown
# docs/guides/claude-desktop.md

# Claude Desktop Integration Guide

## Prerequisites

- Node.js 22+
- Claude Desktop application
- Node-RED instance (local or remote)

## Setup

### 1. Install and Build

```bash
git clone https://github.com/ziv-daniel/node-red-mcp.git
cd node-red-mcp
yarn install
yarn build
```

### 2. Configure Claude Desktop

Edit your Claude Desktop config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nodered": {
      "command": "node",
      "args": ["/absolute/path/to/nodered_mcp/dist/index.mjs"],
      "env": {
        "NODERED_URL": "http://localhost:1880",
        "NODERED_USERNAME": "admin",
        "NODERED_PASSWORD": "your-password"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Restart Claude Desktop to load the MCP server.

### 4. Verify Connection

Ask Claude: "Can you list my Node-RED flows?"

## Usage Examples

[... detailed usage examples ...]
```

### Phase 4: Interactive Documentation (Week 2)

```typescript
// Serve Swagger UI
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const swaggerDocument = YAML.load('./docs/api/openapi.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MCP Node-RED Server API'
}));
```

### Phase 5: Code Examples (Week 3)

```typescript
// examples/nodejs/basic-usage.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'example-client',
  version: '1.0.0'
});

// Connect to server
await client.connect(transport);

// Get flows
const flows = await client.callTool('get_flows', {
  includeDetails: false
});

console.log('Flows:', flows);

// Create a flow
const newFlow = await client.callTool('create_flow', {
  flowData: {
    label: 'My New Flow',
    nodes: [],
    connections: {}
  }
});

console.log('Created flow:', newFlow);
```

```python
# examples/python/basic_usage.py

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters

async def main():
    server = StdioServerParameters(
        command="node",
        args=["/path/to/dist/index.mjs"]
    )

    async with ClientSession(*server) as session:
        # Initialize
        await session.initialize()

        # Get flows
        flows = await session.call_tool("get_flows", {
            "includeDetails": False
        })

        print(f"Flows: {flows}")
```

### Documentation CI/CD

```yaml
# .github/workflows/docs.yml
name: Documentation

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate OpenAPI
        uses: char0n/swagger-editor-validate@v1
        with:
          definition-file: docs/api/openapi.yaml

      - name: Check links
        uses: gaurav-nelson/github-action-markdown-link-check@v1

  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - name: Deploy to GitHub Pages
        # Deploy Swagger UI to GitHub Pages
```

## Related ADRs

- [ADR-001: MCP Transport Layer Selection](./001-mcp-transport-selection.md) - API design
- [ADR-011: SSE Implementation Completion](./011-sse-implementation-completion.md) - SSE documentation needs

## References

- [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.0)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [Redoc](https://redocly.com/redoc)
- [API Documentation Best Practices](https://swagger.io/blog/api-documentation/best-practices-in-api-documentation/)
- [Write the Docs](https://www.writethedocs.org/)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
