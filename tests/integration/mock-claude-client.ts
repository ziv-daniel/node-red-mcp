/**
 * Mock Claude Client
 * Simulates exactly what Claude.ai does when connecting to a remote MCP server.
 *
 * Flow:
 *  1. GET /.well-known/oauth-authorization-server
 *  2. POST /oauth/register  (dynamic client registration)
 *  3. GET  /oauth/authorize  (PKCE, auto-follow redirect)
 *  4. POST /oauth/token      (exchange code for access token)
 *  5. POST /mcp              initialize
 *  6. POST /mcp              tools/list
 *  7. POST /mcp              tools/call
 */

import { createHash, randomBytes } from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface MockClaudeClientConfig {
  baseUrl: string; // e.g. http://localhost:3000
}

export interface ClaudeConnectionResult {
  success: boolean;
  accessToken?: string;
  sessionId?: string;
  protocolVersion?: string;
  tools?: unknown[];
  errors: string[];
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function makeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function makeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; followRedirects?: false }
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.body ? { 'Content-Length': String(Buffer.byteLength(options.body)) } : {}),
          ...options.headers,
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: data,
          });
        });
      }
    );

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Mock Claude Client ────────────────────────────────────────────────────────

export class MockClaudeClient {
  private baseUrl: string;
  private accessToken?: string;
  private sessionId?: string;
  private clientId?: string;
  private redirectUri: string;

  constructor(config: MockClaudeClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.redirectUri = `${this.baseUrl}/oauth/callback`; // local loopback for tests
  }

  async connect(): Promise<ClaudeConnectionResult> {
    const result: ClaudeConnectionResult = { success: false, errors: [] };

    // ── Step 1: Discover OAuth server ──────────────────────────────────────
    let authEndpoint: string;
    let tokenEndpoint: string;
    let registrationEndpoint: string | undefined;

    try {
      const disc = await request(`${this.baseUrl}/.well-known/oauth-authorization-server`, {});
      if (disc.status !== 200) {
        result.errors.push(`Discovery failed: HTTP ${disc.status}`);
        return result;
      }
      const meta = parseJson<{
        authorization_endpoint: string;
        token_endpoint: string;
        registration_endpoint?: string;
      }>(disc.body);
      if (!meta?.authorization_endpoint) {
        result.errors.push('Discovery: missing authorization_endpoint');
        return result;
      }
      authEndpoint = meta.authorization_endpoint;
      tokenEndpoint = meta.token_endpoint;
      registrationEndpoint = meta.registration_endpoint;
    } catch (e) {
      result.errors.push(`Discovery error: ${e}`);
      return result;
    }

    // ── Step 2: Dynamic Client Registration ────────────────────────────────
    if (registrationEndpoint) {
      try {
        const reg = await request(registrationEndpoint, {
          method: 'POST',
          body: JSON.stringify({
            client_name: 'Mock Claude Client',
            redirect_uris: [this.redirectUri],
            scope: 'mcp:read mcp:write',
          }),
        });
        if (reg.status === 201) {
          const body = parseJson<{ client_id: string }>(reg.body);
          if (body?.client_id) this.clientId = body.client_id;
        }
      } catch {
        // Registration is optional — fall through to default client
      }
    }

    const clientId = this.clientId ?? 'claude-ai-client';

    // ── Step 3: Authorization Code + PKCE ──────────────────────────────────
    const verifier = makeVerifier();
    const challenge = makeChallenge(verifier);
    const state = randomBytes(8).toString('hex');

    const authorizeUrl =
      `${authEndpoint}?` +
      new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: this.redirectUri,
        scope: 'mcp:read mcp:write',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();

    let code: string;
    try {
      // Server redirects → we catch the redirect and extract `code`
      const auth = await request(authorizeUrl, { followRedirects: false });
      if (auth.status !== 302) {
        result.errors.push(`Authorize: expected 302, got ${auth.status}`);
        return result;
      }
      const location = auth.headers['location'] as string;
      if (!location) {
        result.errors.push('Authorize: missing Location header');
        return result;
      }
      const codeParam = new URL(location).searchParams.get('code');
      if (!codeParam) {
        result.errors.push(`Authorize: no code in redirect: ${location}`);
        return result;
      }
      code = codeParam;
    } catch (e) {
      result.errors.push(`Authorize error: ${e}`);
      return result;
    }

    // ── Step 4: Token Exchange ──────────────────────────────────────────────
    try {
      const tok = await request(tokenEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }),
      });
      if (tok.status !== 200) {
        result.errors.push(`Token exchange failed: HTTP ${tok.status} — ${tok.body}`);
        return result;
      }
      const tokenBody = parseJson<{ access_token: string }>(tok.body);
      if (!tokenBody?.access_token) {
        result.errors.push('Token response missing access_token');
        return result;
      }
      this.accessToken = tokenBody.access_token;
      result.accessToken = this.accessToken;
    } catch (e) {
      result.errors.push(`Token error: ${e}`);
      return result;
    }

    // ── Step 5: MCP initialize ──────────────────────────────────────────────
    try {
      const init = await request(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'mock-claude', version: '1.0.0' },
          },
        }),
      });

      if (init.status !== 200) {
        result.errors.push(`Initialize failed: HTTP ${init.status}`);
        return result;
      }

      this.sessionId = init.headers['mcp-session-id'] as string | undefined;
      result.sessionId = this.sessionId;

      const initBody = parseJson<{ result?: { protocolVersion: string } }>(init.body);
      result.protocolVersion = initBody?.result?.protocolVersion;
    } catch (e) {
      result.errors.push(`Initialize error: ${e}`);
      return result;
    }

    // ── Step 6: tools/list ─────────────────────────────────────────────────
    try {
      const toolsRes = await request(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
      });

      const toolsBody = parseJson<{ result?: { tools: unknown[] } }>(toolsRes.body);
      result.tools = toolsBody?.result?.tools ?? [];
    } catch (e) {
      result.errors.push(`tools/list error: ${e}`);
    }

    result.success = result.errors.length === 0;
    return result;
  }
}
