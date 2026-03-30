/**
 * Session Manager — tracks per-client MCP sessions
 * Required for Claude.ai web connector (Mcp-Session-Id header)
 */

import { randomUUID } from 'crypto';

export interface McpSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  userId?: string;
  clientInfo?: {
    name?: string;
    version?: string;
  };
  initialized: boolean;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class SessionManager {
  private sessions = new Map<string, McpSession>();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    // Clean up expired sessions every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  create(userId?: string, clientInfo?: McpSession['clientInfo']): McpSession {
    const session: McpSession = {
      id: randomUUID(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      ...(userId !== undefined ? { userId } : {}),
      ...(clientInfo !== undefined ? { clientInfo } : {}),
      initialized: false,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): McpSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastActivity = Date.now();
    return session;
  }

  markInitialized(id: string): boolean {
    const session = this.get(id);
    if (!session) return false;
    session.initialized = true;
    return true;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private isExpired(session: McpSession): boolean {
    return Date.now() - session.lastActivity > this.ttlMs;
  }

  private cleanup(): void {
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
      }
    }
  }

  getStats(): { total: number; initialized: number } {
    let initialized = 0;
    for (const s of this.sessions.values()) {
      if (s.initialized) initialized++;
    }
    return { total: this.sessions.size, initialized };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}
