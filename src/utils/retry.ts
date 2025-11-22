/**
 * Retry utilities with exponential backoff and circuit breaker
 * 2025 Reliability & Resilience Standards
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number; // milliseconds
  maxDelay?: number; // milliseconds
  backoffMultiplier?: number;
  timeout?: number; // milliseconds
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  successThreshold?: number; // Number of successes to close circuit
  timeout?: number; // Milliseconds to wait before trying again
  onStateChange?: (state: CircuitState) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    timeout,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Apply timeout if specified
      if (timeout) {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), timeout)
          ),
        ]);
      }
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Call onRetry callback
      if (onRetry) {
        onRetry(lastError, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 60000,
      onStateChange: options.onStateChange ?? (() => {}),
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      // Try half-open
      this.setState('half-open');
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

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.setState('closed');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState('open');
      this.nextAttempt = Date.now() + this.options.timeout;
    }
  }

  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);

      if (newState === 'closed') {
        this.successCount = 0;
      }
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}

/**
 * Retry with circuit breaker
 */
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: CircuitBreaker,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return circuitBreaker.execute(() => retryWithBackoff(fn, retryOptions));
}

/**
 * Batch retry - retry multiple operations with shared circuit breaker
 */
export async function batchRetry<T>(
  operations: (() => Promise<T>)[],
  circuitBreaker: CircuitBreaker,
  retryOptions: RetryOptions = {}
): Promise<(T | Error)[]> {
  return Promise.all(
    operations.map(async op => {
      try {
        return await retryWithCircuitBreaker(op, circuitBreaker, retryOptions);
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    })
  );
}

/**
 * Create a retriable function
 */
export function retriable<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: RetryOptions = {}
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}

/**
 * Timeout promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}
