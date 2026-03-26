/**
 * Contract tests — Session Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SessionManager } from '../../src/server/session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('creates a session with a unique ID', () => {
    const s1 = manager.create();
    const s2 = manager.create();
    expect(s1.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
  });

  it('retrieves a session by ID', () => {
    const session = manager.create('user-1');
    const found = manager.get(session.id);
    expect(found?.userId).toBe('user-1');
  });

  it('returns undefined for unknown session ID', () => {
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('marks session as initialized', () => {
    const session = manager.create();
    expect(session.initialized).toBe(false);
    manager.markInitialized(session.id);
    expect(manager.get(session.id)?.initialized).toBe(true);
  });

  it('deletes a session', () => {
    const session = manager.create();
    manager.delete(session.id);
    expect(manager.get(session.id)).toBeUndefined();
  });

  it('reports correct stats', () => {
    const s1 = manager.create();
    const s2 = manager.create();
    manager.markInitialized(s1.id);

    const stats = manager.getStats();
    expect(stats.total).toBe(2);
    expect(stats.initialized).toBe(1);
  });

  it('expires sessions beyond TTL', () => {
    // 1ms TTL
    const shortManager = new SessionManager(1);
    const session = shortManager.create();

    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(shortManager.get(session.id)).toBeUndefined();
        shortManager.destroy();
        resolve();
      }, 10);
    });
  });
});
