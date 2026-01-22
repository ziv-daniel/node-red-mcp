# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the MCP
Node-RED Server project. ADRs document significant architectural decisions made
throughout the project's evolution.

## What are ADRs?

Architecture Decision Records capture important architectural decisions along
with their context and consequences. They help teams:

- **Understand** why certain decisions were made
- **Track** the evolution of architectural decisions over time
- **Onboard** new team members by providing historical context
- **Avoid** revisiting settled decisions unless circumstances change

## ADR Format

We follow the standard ADR format:

- **Title**: Short descriptive title
- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Date**: When the decision was made
- **Context**: What situation led to this decision
- **Decision**: What was decided
- **Consequences**: What are the positive and negative impacts

## ADR List

| ADR                                                                 | Title                                           | Status   | Date       |
| ------------------------------------------------------------------- | ----------------------------------------------- | -------- | ---------- |
| [001](./001-mcp-transport-selection.md)                             | MCP Transport Layer Selection                   | Accepted | 2024-12-17 |
| [002](./002-typescript-build-system.md)                             | TypeScript Build System with tsup               | Accepted | 2024-12-17 |
| [003](./003-testing-strategy.md)                                    | Comprehensive Testing Strategy                  | Accepted | 2024-12-17 |
| [004](./004-observability-stack.md)                                 | Observability Stack Selection                   | Accepted | 2024-12-17 |
| [005](./005-security-architecture.md)                               | Security Architecture and Validation            | Accepted | 2024-12-17 |
| [006](./006-containerization-strategy.md)                           | Containerization and Deployment Strategy        | Accepted | 2024-12-17 |
| [007](./007-package-manager-migration.md)                           | Package Manager Migration to Yarn 4             | Accepted | 2024-12-17 |
| [008](./008-testing-coverage-enhancement.md)                        | Testing Coverage Enhancement                    | Proposed | 2026-01-20 |
| [009](./009-production-observability-strategy.md)                   | Production Observability Strategy               | Proposed | 2026-01-20 |
| [010](./010-docker-deployment-fix.md)                               | Docker Deployment Fix for Yarn 4 and Node 22    | Proposed | 2026-01-20 |
| [011](./011-sse-implementation-completion.md)                       | SSE Implementation Completion                   | Proposed | 2026-01-20 |
| [012](./012-security-layer-finalization.md)                         | Security Layer Finalization                     | Proposed | 2026-01-20 |
| [013](./013-error-handling-recovery-enhancement.md)                 | Error Handling & Recovery Enhancement           | Proposed | 2026-01-20 |
| [014](./014-api-documentation-strategy.md)                          | API Documentation Strategy                      | Proposed | 2026-01-20 |

## Contributing to ADRs

When making significant architectural decisions:

1. **Create** a new ADR using the next sequential number
2. **Follow** the standard format and template
3. **Discuss** with the team during design reviews
4. **Update** the status as the decision evolves
5. **Reference** related ADRs when applicable

## ADR Template

Use this template for new ADRs:

```markdown
# ADR-XXX: [Title]

- **Status**: [Proposed | Accepted | Deprecated | Superseded]
- **Date**: YYYY-MM-DD
- **Authors**: [Names]
- **Reviewers**: [Names]

## Context

[Describe the situation that led to this decision]

## Decision

[Describe what was decided]

## Rationale

[Explain why this decision was made]

## Alternatives Considered

[List other options that were considered]

## Consequences

### Positive

- [List positive impacts]

### Negative

- [List negative impacts or trade-offs]

## Implementation Notes

[Any specific implementation guidance]

## Related ADRs

- [Link to related ADRs]

## References

- [External links and resources]
```

## Status Summary

### Foundation (Accepted)
Core architectural decisions that form the foundation of the system:
- ADR-001 through ADR-007: Completed and accepted

### Enhancements (Proposed)
Improvements and completion of ongoing work:
- **ADR-008**: Testing Coverage - Achieve 80%+ coverage for production readiness
- **ADR-009**: Observability - Comprehensive logging, metrics, and tracing
- **ADR-010**: Docker Fix - Resolve Yarn 4/Node 22 compatibility issues
- **ADR-011**: SSE Completion - Finish real-time event streaming features
- **ADR-012**: Security - Implement RBAC and complete authorization layer
- **ADR-013**: Error Handling - Enhanced retry logic and graceful degradation
- **ADR-014**: Documentation - Comprehensive API and integration documentation

These proposed ADRs address the identified gaps and provide a roadmap for completing the production-ready system.

---

_Last Updated: 2026-01-20_
