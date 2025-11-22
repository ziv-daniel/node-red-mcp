/**
 * Tests for retry utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  retryWithBackoff,
  CircuitBreaker,
  retryWithCircuitBreaker,
  retriable,
  withTimeout,
  type RetryOptions,
} from './retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, { initialDelay: 100 });

    // Fast-forward through delays
    await vi.advanceTimersByTimeAsync(100); // After first retry delay
    await vi.advanceTimersByTimeAsync(200); // After second retry delay (exponential backoff)

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      initialDelay: 100,
    }).catch(error => error); // Catch to prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should apply exponential backoff', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
      onRetry,
    }).catch(error => error); // Catch to prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(1000); // 1st retry: 1000ms
    await vi.advanceTimersByTimeAsync(2000); // 2nd retry: 2000ms
    await vi.advanceTimersByTimeAsync(4000); // 3rd retry: 4000ms

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('fail');

    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 1000);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 2000);
    expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, 4000);
  });

  it('should respect maxDelay', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 10,
      maxDelay: 3000,
      onRetry,
    }).catch(error => error); // Catch to prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(1000); // 1st retry: 1000ms
    await vi.advanceTimersByTimeAsync(3000); // 2nd retry: capped at 3000ms
    await vi.advanceTimersByTimeAsync(3000); // 3rd retry: capped at 3000ms

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('fail');

    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 3000);
    expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, 3000);
  });

  it('should use shouldRetry predicate', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retryable'))
      .mockRejectedValueOnce(new Error('non-retryable'));

    const shouldRetry = vi.fn((error: Error) => {
      return error.message === 'retryable';
    });

    const promise = retryWithBackoff(fn, {
      maxRetries: 5,
      initialDelay: 100,
      shouldRetry,
    }).catch(error => error); // Catch to prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('non-retryable');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(shouldRetry).toHaveBeenCalledTimes(2);
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('should open after reaching failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trigger 3 failures
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    await expect(cb.execute(fn)).rejects.toThrow('fail');

    expect(cb.getState()).toBe('open');
  });

  it('should reject immediately when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 60000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trigger failure to open circuit
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    // Next call should be rejected immediately
    await expect(cb.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
    expect(fn).toHaveBeenCalledTimes(1); // fn not called second time
  });

  it('should transition to half-open after timeout', async () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    // Advance past timeout
    vi.advanceTimersByTime(5001);

    // Next call should try half-open
    const fn2 = vi.fn().mockRejectedValue(new Error('still failing'));
    await expect(cb.execute(fn2)).rejects.toThrow('still failing');

    vi.restoreAllMocks();
  });

  it('should close after success threshold in half-open state', async () => {
    vi.useFakeTimers();

    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      timeout: 5000,
    });

    // Open the circuit
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(cb.execute(failFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    // Wait for timeout
    vi.advanceTimersByTime(5001);

    // Succeed twice to close circuit
    const successFn = vi.fn().mockResolvedValue('success');
    await cb.execute(successFn);
    expect(cb.getState()).toBe('half-open');

    await cb.execute(successFn);
    expect(cb.getState()).toBe('closed');

    vi.restoreAllMocks();
  });

  it('should call onStateChange callback', async () => {
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({ failureThreshold: 2, onStateChange });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(cb.execute(fn)).rejects.toThrow();
    await expect(cb.execute(fn)).rejects.toThrow();

    expect(onStateChange).toHaveBeenCalledWith('open');
  });

  it('should provide stats', () => {
    const cb = new CircuitBreaker();
    const stats = cb.getStats();

    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
    expect(stats).toHaveProperty('successCount');
    expect(stats).toHaveProperty('nextAttempt');
  });

  it('should reset state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(cb.execute(fn)).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    // Reset
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getStats().failureCount).toBe(0);
  });
});

describe('retryWithCircuitBreaker', () => {
  it('should combine retry and circuit breaker', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    vi.useFakeTimers();
    const promise = retryWithCircuitBreaker(fn, cb, { initialDelay: 100 });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('success');
    expect(cb.getState()).toBe('closed');

    vi.restoreAllMocks();
  });
});

describe('retriable', () => {
  it('should create a retriable function', async () => {
    const originalFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const retriableFn = retriable(originalFn, { initialDelay: 100 });

    vi.useFakeTimers();
    const promise = retriableFn();
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('success');
    expect(originalFn).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it('should pass arguments through', async () => {
    const originalFn = vi.fn().mockResolvedValue('success');
    const retriableFn = retriable(originalFn);

    await retriableFn('arg1', 'arg2');

    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));

    const timeoutPromise = withTimeout(promise, 1000);

    vi.advanceTimersByTime(100);
    const result = await timeoutPromise;

    expect(result).toBe('success');
  });

  it('should reject if promise exceeds timeout', async () => {
    const promise = new Promise(resolve => setTimeout(() => resolve('too late'), 2000));

    const timeoutPromise = withTimeout(promise, 1000, 'Custom timeout message');

    vi.advanceTimersByTime(1000);

    await expect(timeoutPromise).rejects.toThrow('Custom timeout message');
  });
});
