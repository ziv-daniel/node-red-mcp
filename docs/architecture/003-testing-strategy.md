# ADR-003: Comprehensive Testing Strategy

- **Status**: Accepted
- **Date**: 2024-12-17
- **Authors**: MCP Node-RED Server Team
- **Reviewers**: Architecture Review Board

## Context

The MCP Node-RED Server requires a robust testing strategy to ensure
reliability, maintainability, and confidence in deployments. The project serves
as a critical integration layer between Claude Desktop and Node-RED, making test
coverage essential for:

1. **MCP Protocol Compliance**: Ensuring correct implementation of MCP
   specification
2. **Node-RED Integration**: Validating communication with Node-RED instances
3. **Multiple Transport Layers**: Testing both stdio and HTTP transport methods
4. **Real-time Features**: Validating Server-Sent Events and WebSocket
   functionality
5. **Security Features**: Testing authentication, authorization, and input
   validation
6. **Performance Requirements**: Ensuring acceptable response times under load
7. **Cross-Platform Compatibility**: Supporting Windows, macOS, and Linux
   environments

Traditional testing approaches often fall short for complex integration
scenarios, requiring a comprehensive strategy covering unit, integration, and
end-to-end testing.

## Decision

We adopted a **multi-layered testing strategy** using modern testing frameworks
optimized for 2025 development practices:

### Primary Testing Stack

1. **Unit Testing**: Vitest for fast, reliable unit tests
2. **End-to-End Testing**: Playwright for comprehensive browser and API testing
3. **Integration Testing**: Custom Node-RED integration tests within Playwright
4. **API Testing**: HTTP endpoint testing using Playwright's request
   capabilities
5. **Mocking**: MSW (Mock Service Worker) for API mocking and Vitest's built-in
   mocks

### Testing Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
    testTimeout: 10000,
    setupFiles: ['./test/setup.ts'],
  },
});
```

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html'], ['junit', { outputFile: 'test-results.xml' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'yarn start',
      port: 3000,
      timeout: 120000,
    },
    {
      command: 'node-red --port 1880',
      port: 1880,
      timeout: 60000,
    },
  ],
});
```

## Rationale

### Why Vitest over Jest?

1. **Performance**: 2-10x faster test execution with ESM-first architecture
2. **Modern Features**: Native TypeScript support, top-level await, ES modules
3. **Developer Experience**: HMR for tests, better error messages, integrated UI
4. **Vite Integration**: Consistent build pipeline with potential future
   frontend
5. **Coverage**: Built-in V8 coverage that's more accurate than Istanbul

### Why Playwright over Cypress?

1. **Multi-Browser**: Native support for Chromium, Firefox, and WebKit
2. **API Testing**: Excellent HTTP request testing capabilities
3. **Performance**: Faster and more reliable test execution
4. **Modern Architecture**: Better handling of modern web applications
5. **Node.js Integration**: Perfect for testing Node.js APIs and services

### Testing Pyramid Structure

```
     /\
    /  \      E2E Tests (Playwright)
   /____\     - Full system integration
  /      \    - Real Node-RED instance
 /        \   - Multiple browsers
/__________\  - Critical user journeys

      /\
     /  \     Integration Tests (Playwright + Custom)
    /____\    - MCP protocol testing
   /      \   - Node-RED API integration
  /        \  - Transport layer testing
 /__________\ - Database interactions

        /\
       /  \   Unit Tests (Vitest)
      /____\  - Business logic
     /      \ - Utility functions
    /        \- Validation schemas
   /__________\- Individual components
```

## Alternatives Considered

### Jest + Testing Library + Cypress

- **Pros**: Mature ecosystem, extensive community, familiar to many developers
- **Cons**: Slower performance, complex ESM setup, outdated architecture

### Mocha + Chai + Puppeteer

- **Pros**: Lightweight, flexible, good performance
- **Cons**: More manual configuration, less integrated developer experience

### Native Node.js Test Runner + Playwright

- **Pros**: No additional test runner dependency, very fast
- **Cons**: Less mature tooling, limited features, poor developer experience

### AVA + TestCafe

- **Pros**: Parallel execution, good TypeScript support
- **Cons**: Smaller community, limited ecosystem, learning curve

## Consequences

### Positive

- **Developer Productivity**: Fast test execution with instant feedback via
  watch mode
- **Confidence**: High test coverage (85%+) ensures reliable deployments
- **Quality Assurance**: Multi-browser E2E testing catches cross-platform issues
- **Regression Prevention**: Comprehensive test suite prevents breaking changes
- **Documentation**: Tests serve as executable documentation of system behavior
- **Continuous Integration**: Fast, reliable tests enable confident automated
  deployments
- **Debugging**: Excellent debugging capabilities with trace viewer and
  screenshots

### Negative

- **Complexity**: Multiple testing frameworks require team training and
  maintenance
- **Resource Usage**: E2E tests require more system resources and time
- **Test Maintenance**: Large test suite requires ongoing maintenance effort
- **Flakiness Risk**: E2E tests can be flaky, requiring retry strategies and
  careful design

## Implementation Notes

### Test Organization

```
test/
├── setup.ts                # Global test setup
└── helpers/                # Test utilities

src/
├── **/*.test.ts            # Unit tests alongside source
└── **/__tests__/           # Component test directories

e2e/
├── global-setup.ts         # E2E environment setup
├── global-teardown.ts      # E2E cleanup
├── health.spec.ts          # Health check tests
├── mcp-integration.spec.ts # MCP protocol tests
└── nodered.spec.ts         # Node-RED integration tests
```

### Test Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui --open",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:debug": "playwright test --debug"
}
```

### Coverage Requirements

- **Statements**: 85% minimum
- **Branches**: 85% minimum
- **Functions**: 85% minimum
- **Lines**: 85% minimum
- **Critical Paths**: 95% minimum (authentication, MCP protocol, data
  validation)

### Test Categories

1. **Unit Tests** (Fast, Isolated)
   - Validation schemas
   - Utility functions
   - Business logic
   - Error handling

2. **Integration Tests** (Medium, Controlled)
   - MCP transport layers
   - Node-RED API calls
   - Database operations
   - External service integration

3. **End-to-End Tests** (Slow, Realistic)
   - Complete user workflows
   - Multi-service integration
   - Performance testing
   - Cross-browser compatibility

## Related ADRs

- [ADR-001: MCP Transport Layer Selection](./001-mcp-transport-selection.md) -
  Testing multiple transport methods
- [ADR-002: TypeScript Build System with tsup](./002-typescript-build-system.md) -
  Testing build outputs
- [ADR-005: Security Architecture and Validation](./005-security-architecture.md) -
  Security testing requirements

## References

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Best Practices](https://testing-library.com/)
- [MSW Documentation](https://mswjs.io/)
- [Test Pyramid Concept](https://martinfowler.com/articles/practical-test-pyramid.html)

---

_Created: 2024-12-17 | Last Updated: 2024-12-17_
