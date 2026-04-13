# ADR-008: Testing Coverage Enhancement

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: Development Team
- **Reviewers**: Tech Lead, QA Team

## Context

Current test coverage stands at approximately 30%, which is significantly below
industry standards for production-grade systems. This low coverage creates
several risks:

1. **Regression Risk**: Changes may break existing functionality without
   detection
2. **Refactoring Difficulty**: Lack of tests makes safe refactoring nearly
   impossible
3. **Documentation Gap**: Tests serve as executable documentation of expected
   behavior
4. **Debugging Overhead**: Issues discovered in production are more costly to
   fix
5. **Confidence Issues**: Developers hesitant to make changes due to fear of
   breaking things

### Current Coverage Breakdown

- **Service Layer**: ~25% - Critical business logic undertested
- **API Routes**: ~40% - Some basic endpoint tests exist
- **MCP Tools**: ~20% - Tool implementations lack comprehensive tests
- **Integration**: ~10% - End-to-end workflows minimally tested
- **SSE/WebSocket**: 0% - Real-time features completely untested

### Testing Framework Status

- **Unit/Integration**: Vitest configured but underutilized
- **E2E**: Playwright configured but tests disabled due to CI failures
- **Coverage Reporting**: V8 coverage enabled, thresholds adjusted down to
  current baseline

## Decision

Implement a comprehensive testing strategy to achieve **80%+ code coverage**
across all critical paths with the following priorities:

### Phase 1: Foundation (Weeks 1-2)

1. **Service Layer Unit Tests**: 80%+ coverage for all service methods
   - Node-RED API client (flows, nodes, runtime)
   - MCP tool implementations
   - Utility functions and helpers

2. **Integration Tests**: MCP protocol workflows
   - Tool invocation and response formatting
   - Error handling and validation
   - Authentication and authorization flows

### Phase 2: Real-time Features (Week 3)

3. **SSE/WebSocket Tests**
   - Connection lifecycle management
   - Event filtering and subscription
   - Heartbeat and reconnection logic
   - Multiple concurrent connections

### Phase 3: End-to-End (Week 4)

4. **E2E Tests with Playwright**
   - Critical user journeys
   - Flow management workflows
   - Real-time monitoring scenarios
   - Error recovery paths

### Testing Principles

- **Test Pyramid**: Many unit tests, fewer integration tests, some E2E tests
- **Coverage Gates**: CI/CD fails if coverage drops below 80%
- **Test Quality**: Focus on meaningful tests, not just coverage numbers
- **Maintainability**: Keep tests simple, readable, and maintainable

## Rationale

### Why 80%+?

- **Industry Standard**: 80% is recognized as professional baseline for
  production systems
- **Diminishing Returns**: Beyond 80-90% often tests trivial code with little
  value
- **Balance**: Provides strong safety net without excessive test maintenance
  burden
- **Risk Reduction**: Catches vast majority of regressions and bugs

### Why This Approach?

- **Bottom-Up**: Start with unit tests (fastest, most stable) before E2E
- **Critical Path First**: Focus on service layer where business logic lives
- **Pragmatic**: 80% is achievable and maintainable, 100% is often wasteful
- **Incremental**: Phased approach allows learning and adjustment

### Business Value

- **Faster Development**: Confident refactoring enables faster iteration
- **Lower Costs**: Bugs caught early are 10-100x cheaper to fix
- **Better Design**: Testability forces better architecture
- **Documentation**: Tests show how code is meant to be used

## Alternatives Considered

### Alternative 1: Maintain Current Coverage (30%)

**Pros**:

- No immediate time investment
- Faster short-term feature delivery

**Cons**:

- High regression risk
- Difficult refactoring
- Increasing technical debt
- Poor production quality
- Not suitable for production use

**Verdict**: ❌ Rejected - Unacceptable for production system

### Alternative 2: Target 60% Coverage

**Pros**:

- Less effort than 80%
- Some safety improvements
- Faster to achieve

**Cons**:

- Still below industry standards
- Insufficient for production confidence
- Leaves critical paths untested

**Verdict**: ❌ Rejected - Insufficient quality bar

### Alternative 3: Target 100% Coverage

**Pros**:

- Maximum theoretical coverage
- "Perfect" quality metric

**Cons**:

- Diminishing returns beyond 80-90%
- Excessive time investment
- Tests become maintenance burden
- Often tests trivial code (getters, setters)
- False sense of security

**Verdict**: ❌ Rejected - Overengineering, unsustainable

### Alternative 4: TDD for All New Code Only

**Pros**:

- No retroactive work needed
- Gradual improvement
- Lower immediate cost

**Cons**:

- Existing code remains risky
- Takes years to reach good coverage
- Refactoring old code still dangerous

**Verdict**: ❌ Rejected - Too slow, leaves existing debt

## Consequences

### Positive

- ✅ **Regression Protection**: Changes caught before production
- ✅ **Refactoring Confidence**: Safe to improve code structure
- ✅ **Better Design**: Testability improves architecture
- ✅ **Documentation**: Tests show intended usage
- ✅ **Faster Debugging**: Failing test pinpoints problem
- ✅ **Production Ready**: Meets industry quality standards
- ✅ **Developer Confidence**: Team can make changes safely
- ✅ **Onboarding**: New developers learn system through tests

### Negative

- ⚠️ **Initial Time Investment**: 3-4 weeks of focused effort
- ⚠️ **Ongoing Maintenance**: Tests need updates as code changes
- ⚠️ **Slower Initial Features**: Testing slows development short-term
- ⚠️ **Learning Curve**: Team needs to learn testing best practices
- ⚠️ **CI/CD Time**: More tests = longer CI/CD runs
- ⚠️ **False Positives**: Flaky tests can block deployments

### Mitigation Strategies

- Use fast unit tests as foundation (quick feedback)
- Parallelize test execution in CI/CD
- Invest in testing infrastructure and tooling
- Train team on testing best practices
- Monitor and fix flaky tests aggressively
- Use test coverage tools to identify gaps

## Implementation Notes

### Phase 1: Service Layer (Weeks 1-2)

```typescript
// Example: Service layer unit test structure
describe('NodeRedApiService', () => {
  describe('getFlows', () => {
    it('should return flows with summary when includeDetails is false', async () => {
      // Arrange
      const mockResponse = {
        /* mock data */
      };
      vi.spyOn(axios, 'get').mockResolvedValue({ data: mockResponse });

      // Act
      const result = await service.getFlows({ includeDetails: false });

      // Assert
      expect(result).toHaveLength(13);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('label');
    });

    it('should handle API errors gracefully', async () => {
      // Test error scenarios
    });
  });
});
```

### Phase 2: Integration Tests (Week 2)

```typescript
// Example: MCP tool integration test
describe('MCP Tool Integration', () => {
  it('should execute get_flows tool end-to-end', async () => {
    const response = await mcpServer.executeTool('get_flows', {
      includeDetails: false,
    });

    expect(response).toMatchSchema(flowsResponseSchema);
  });
});
```

### Phase 3: E2E Tests (Weeks 3-4)

```typescript
// Example: Playwright E2E test
test('flow management workflow', async ({ page }) => {
  // Navigate and interact with UI
  // Verify real-time updates
  // Check error handling
});
```

### Coverage Configuration

Update `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test/**',
      ],
    },
  },
});
```

### CI/CD Integration

```yaml
# .github/workflows/ci.yml
- name: Run tests with coverage
  run: yarn test:coverage

- name: Check coverage thresholds
  run: |
    if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 80 ]; then
      echo "Coverage below 80%"
      exit 1
    fi

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
```

### Test Organization

```
test/
├── unit/                    # Fast, isolated unit tests
│   ├── services/
│   ├── utils/
│   └── tools/
├── integration/             # Integration tests
│   ├── mcp-protocol/
│   ├── node-red-api/
│   └── sse/
├── e2e/                     # End-to-end tests
│   ├── flow-management/
│   ├── real-time-monitoring/
│   └── error-scenarios/
└── fixtures/               # Test data and mocks
    ├── flows/
    └── responses/
```

### Testing Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One Assertion Focus**: Each test focuses on one behavior
3. **Clear Names**: Test names describe what they test
4. **No Test Interdependence**: Tests can run in any order
5. **Fast Execution**: Unit tests should run in milliseconds
6. **Mock External Dependencies**: Don't call real Node-RED API in unit tests

### Metrics to Track

- **Coverage**: Lines, branches, functions, statements
- **Test Count**: Unit, integration, E2E breakdown
- **Execution Time**: Total and per-test-suite
- **Flakiness**: Track and fix flaky tests
- **Failure Rate**: Catch increases that indicate quality issues

## Related ADRs

- [ADR-003: Comprehensive Testing Strategy](./003-testing-strategy.md) - Initial
  testing approach
- [ADR-002: TypeScript Build System](./002-typescript-build-system.md) - Build
  configuration affects test setup

## References

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Test Coverage Best Practices (Martin Fowler)](https://martinfowler.com/bliki/TestCoverage.html)
- [Google Testing Blog](https://testing.googleblog.com/)
- [Effective Unit Testing](https://www.manning.com/books/effective-unit-testing)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
