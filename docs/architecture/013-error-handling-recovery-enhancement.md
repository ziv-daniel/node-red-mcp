# ADR-013: Error Handling & Recovery Enhancement

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: Development Team
- **Reviewers**: Tech Lead, SRE Team

## Context

Current error handling is ~50% complete with basic error classes and response
formatting, but lacks sophisticated retry logic, connection recovery, and graceful
degradation:

### Current State
- ✅ **Basic Error Handling**: Error classes and response formatting exist
- ✅ **Circuit Breaker**: Basic circuit breaker pattern for Node-RED API
- 🔄 **Retry Logic**: Simple retry without exponential backoff
- ⏳ **Connection Recovery**: Insufficient reconnection for SSE and Node-RED
- ⏳ **Graceful Degradation**: No partial functionality during failures
- ⏳ **Error Context**: Limited error context and debugging info

### Problems
1. **Cascading Failures**: Single Node-RED failure breaks all operations
2. **Poor UX**: Generic error messages don't help users
3. **Debugging Difficulty**: Insufficient context for troubleshooting
4. **Resource Leaks**: Failed connections not cleaned up properly
5. **No Backoff**: Immediate retries overwhelm failing services
6. **Silent Failures**: Some errors not logged or surfaced

### Error Sources
- **Node-RED API**: Connection timeouts, 500 errors, auth failures
- **Network**: DNS failures, connection refused, timeouts
- **MCP Protocol**: Invalid tool calls, malformed responses
- **SSE Connections**: Client disconnects, server errors
- **Internal**: Bugs, unhandled exceptions, async errors

## Decision

Implement comprehensive error handling with **circuit breaker pattern**,
**exponential backoff retry**, **graceful degradation**, and **rich error context**:

### Error Handling Strategy

```
┌─────────────────────────────────────┐
│     Error Handling Architecture     │
├─────────────────────────────────────┤
│  1. Error Detection                 │
│  2. Error Classification            │
│  3. Circuit Breaker Check           │
│  4. Retry with Backoff              │
│  5. Fallback/Degradation            │
│  6. Error Logging & Alerting        │
│  7. User-friendly Error Response    │
└─────────────────────────────────────┘
```

### Error Classification

**Retryable Errors** (transient, may succeed on retry):
- Network timeouts
- 429 Too Many Requests
- 502/503/504 Gateway errors
- Connection refused (Node-RED starting up)
- DNS temporary failures

**Non-Retryable Errors** (permanent, won't succeed):
- 400 Bad Request (invalid parameters)
- 401 Unauthorized (wrong credentials)
- 403 Forbidden (insufficient permissions)
- 404 Not Found (resource doesn't exist)
- Validation errors

**Fatal Errors** (system-level failures):
- Out of memory
- Unhandled exceptions
- Corrupted state
- Missing required configuration

### Retry Strategy: Exponential Backoff

```typescript
// Retry configuration
const retryConfig = {
  maxAttempts: 5,
  initialDelay: 1000,      // 1 second
  maxDelay: 30000,         // 30 seconds
  multiplier: 2,           // Double each time
  jitter: true             // Add randomness
};

// Retry delays: 1s, 2s, 4s, 8s, 16s (with jitter)
```

**Jitter**: Adds randomness to prevent thundering herd problem

**Per-Operation Config**:
- Critical operations: More retries (5-7 attempts)
- Read operations: Moderate retries (3-5 attempts)
- Write operations: Fewer retries (2-3 attempts, with idempotency check)

### Circuit Breaker Enhancement

**States**:
- **Closed**: Normal operation, requests pass through
- **Open**: Too many failures, requests fail fast
- **Half-Open**: Testing if service recovered

**Configuration**:
```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 2,      // Close after 2 successes in half-open
  timeout: 60000,           // Try half-open after 60s
  volumeThreshold: 10       // Min requests before calculating failure rate
};
```

### Graceful Degradation

**Partial Functionality**:
- If Node-RED unreachable: Return cached flow list (with staleness warning)
- If SSE fails: Fall back to polling
- If authentication fails: Allow read-only operations
- If rate limited: Queue non-urgent requests

**Feature Flags**:
```typescript
const features = {
  sseEnabled: checkSSEHealth(),
  nodeRedWrites: checkNodeRedHealth(),
  moduleInstall: checkNodeRedHealth() && isAdmin()
};
```

### Rich Error Context

**Error Object Structure**:
```typescript
{
  error: {
    code: 'NODERED_CONNECTION_FAILED',
    message: 'Failed to connect to Node-RED',
    userMessage: 'Node-RED is temporarily unavailable. Please try again.',
    details: {
      url: 'http://nodered:1880',
      statusCode: 503,
      attempt: 3,
      maxAttempts: 5,
      nextRetryIn: 4000
    },
    timestamp: '2026-01-20T10:30:00Z',
    correlationId: 'req-123-456',
    stack: '...' // Only in development
  }
}
```

## Rationale

### Why Exponential Backoff?
- **Prevents Overload**: Gives failing service time to recover
- **Fair**: Doesn't monopolize resources
- **Standard**: Industry best practice
- **Jitter**: Prevents synchronized retries (thundering herd)

### Why Circuit Breaker?
- **Fast Failures**: Don't wait for timeout on known-bad service
- **Service Protection**: Prevent overwhelming failed service
- **Recovery**: Automatically test for service recovery
- **User Experience**: Faster error responses

### Why Graceful Degradation?
- **Availability**: Partial functionality better than total failure
- **User Experience**: Users can still do some work
- **Critical Path**: Ensure most important operations work
- **Recovery Time**: Gives time for manual intervention

### Why Rich Error Context?
- **Debugging**: Developers can diagnose issues faster
- **User Communication**: Clear messages help users understand problems
- **Observability**: Better logging and monitoring
- **Support**: Support teams can help users effectively

## Alternatives Considered

### Alternative 1: Simple Try-Catch Only
**Pros**:
- Easiest to implement
- Minimal code

**Cons**:
- No retry logic
- Poor user experience
- Cascading failures
- No recovery

**Verdict**: ❌ Rejected - Insufficient for production

### Alternative 2: Retry Without Backoff
**Pros**:
- Simple implementation
- Fast retries

**Cons**:
- Overwhelms failing services
- Wastes resources
- Thundering herd problem
- Poor recovery

**Verdict**: ❌ Rejected - Can make problems worse

### Alternative 3: Timeout-Based Recovery
**Pros**:
- Simple concept
- No state management

**Cons**:
- No intelligent failure detection
- Wastes time on timeouts
- Poor user experience

**Verdict**: ❌ Rejected - Too simplistic

### Alternative 4: Bulkhead Pattern
**Pros**:
- Isolates failures
- Prevents resource exhaustion
- Better fault isolation

**Cons**:
- More complex
- Resource overhead
- Harder to configure
- Can add later if needed

**Verdict**: ✅ Deferred - Consider for future

## Consequences

### Positive
- ✅ **Resilience**: System handles failures gracefully
- ✅ **Better UX**: Clear error messages, partial functionality
- ✅ **Fast Recovery**: Automatic recovery when services restore
- ✅ **Service Protection**: Don't overwhelm failing services
- ✅ **Debugging**: Rich error context aids troubleshooting
- ✅ **Monitoring**: Better observability of failures
- ✅ **Availability**: Higher uptime through degradation

### Negative
- ⚠️ **Complexity**: More sophisticated error handling code
- ⚠️ **State Management**: Circuit breaker requires state
- ⚠️ **Testing**: More scenarios to test
- ⚠️ **Latency**: Retries add latency to failed requests
- ⚠️ **Resource Usage**: Retries consume resources
- ⚠️ **Cache Management**: Degradation modes need caching

### Mitigation Strategies
- Comprehensive error handling tests
- Clear documentation of retry behavior
- Monitoring of retry rates and circuit breaker state
- Configuration options for retry behavior
- Cache invalidation strategy for degraded mode

## Implementation Notes

### Phase 1: Enhanced Retry Logic (Week 1)

```typescript
// src/utils/retry.ts
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean;
  retryableErrors: (error: any) => boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!config.retryableErrors(error)) {
        throw error;
      }

      // Don't delay on last attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      // Calculate delay with jitter
      const actualDelay = config.jitter
        ? delay * (0.5 + Math.random() * 0.5)
        : delay;

      logger.warn({
        message: 'Retrying after error',
        attempt,
        maxAttempts: config.maxAttempts,
        nextRetryIn: actualDelay,
        error: error.message
      });

      await sleep(actualDelay);

      // Increase delay for next attempt
      delay = Math.min(delay * config.multiplier, config.maxDelay);
    }
  }

  throw lastError;
}

// Usage
const flows = await retryWithBackoff(
  () => nodeRedClient.getFlows(),
  {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    jitter: true,
    retryableErrors: (error) => {
      return error.code === 'ECONNREFUSED' ||
             error.statusCode >= 500 ||
             error.statusCode === 429;
    }
  }
);
```

### Phase 2: Enhanced Circuit Breaker (Week 1)

```typescript
// src/utils/circuit-breaker.ts
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private requestCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.requestCount++;

    // Fast fail if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info('Circuit breaker entering half-open state');
      } else {
        throw new CircuitBreakerOpenError(
          'Circuit breaker is open',
          this.getTimeUntilRetry()
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info('Circuit breaker closed');
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened (failed in half-open state)');
    }

    if (
      this.requestCount >= this.config.volumeThreshold &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened (failure threshold exceeded)');
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.config.timeout;
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

### Phase 3: Graceful Degradation (Week 2)

```typescript
// src/services/degradation.ts
export class DegradationService {
  private cache = new Map<string, { data: any; timestamp: number }>();

  async getFlowsWithDegradation(): Promise<FlowsResponse> {
    try {
      // Try normal operation
      const flows = await this.nodeRedClient.getFlows();
      this.cache.set('flows', { data: flows, timestamp: Date.now() });
      return { data: flows, mode: 'live' };
    } catch (error) {
      // Fall back to cache
      const cached = this.cache.get('flows');

      if (cached) {
        const age = Date.now() - cached.timestamp;
        logger.warn({
          message: 'Using cached flows due to Node-RED error',
          cacheAge: age,
          error: error.message
        });

        return {
          data: cached.data,
          mode: 'cached',
          cacheAge: age,
          warning: 'Data may be stale due to Node-RED unavailability'
        };
      }

      // No cache available
      throw error;
    }
  }
}
```

### Phase 4: Rich Error Context (Week 2)

```typescript
// src/errors/application-error.ts
export class ApplicationError extends Error {
  constructor(
    public code: string,
    message: string,
    public userMessage: string,
    public details?: any,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      details: this.details,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        stack: this.stack
      })
    };
  }
}

// Specific error types
export class NodeRedConnectionError extends ApplicationError {
  constructor(url: string, cause: Error) {
    super(
      'NODERED_CONNECTION_FAILED',
      `Failed to connect to Node-RED at ${url}`,
      'Node-RED is temporarily unavailable. Please try again in a moment.',
      {
        url,
        cause: cause.message
      },
      503
    );
  }
}
```

### Global Error Handler

```typescript
// src/middleware/error-handler.ts
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error with full context
  logger.error({
    error: error.message,
    stack: error.stack,
    correlationId: req.correlationId,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Send user-friendly response
  if (error instanceof ApplicationError) {
    return res.status(error.statusCode).json({
      error: error.toJSON(),
      correlationId: req.correlationId
    });
  }

  // Unknown error
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      userMessage: 'Something went wrong. Please try again or contact support.',
      correlationId: req.correlationId
    }
  });
}
```

### Configuration

```bash
# .env
# Retry Configuration
RETRY_MAX_ATTEMPTS=5
RETRY_INITIAL_DELAY=1000
RETRY_MAX_DELAY=30000
RETRY_MULTIPLIER=2
RETRY_JITTER=true

# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_VOLUME_THRESHOLD=10

# Degradation
ENABLE_CACHE_FALLBACK=true
CACHE_MAX_AGE=300000  # 5 minutes
```

## Related ADRs

- [ADR-009: Production Observability Strategy](./009-production-observability-strategy.md) - Error logging
- [ADR-011: SSE Implementation Completion](./011-sse-implementation-completion.md) - SSE reconnection

## References

- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff (AWS)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Release It! (Michael Nygard)](https://pragprog.com/titles/mnee2/release-it-second-edition/)
- [Error Handling Best Practices](https://www.joyent.com/node-js/production/design/errors)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
