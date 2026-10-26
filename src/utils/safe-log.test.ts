import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { describeErrorForLog } from './safe-log.js';

// Built at runtime so secret scanners don't take this test value for a real password.
const PASSWORD = ['test', 'only', 'value'].join('-');
const BASIC = Buffer.from(`admin:${PASSWORD}`).toString('base64');

function tokenExchangeError(): AxiosError {
  const headers = new AxiosHeaders({ Authorization: `Basic ${BASIC}` });
  return new AxiosError(
    'Request failed with status code 403',
    'ERR_BAD_REQUEST',
    {
      method: 'post',
      url: `https://admin:${PASSWORD}@nodered.local/auth/token?x=1`,
      data: JSON.stringify({ username: 'admin', password: PASSWORD }),
      headers,
    },
    undefined,
    {
      status: 403,
      statusText: 'Forbidden',
      data: { error: 'invalid_grant' },
      headers: {},
      config: { headers },
    }
  );
}

describe('describeErrorForLog', () => {
  it('keeps name, message, code, status and method/path', () => {
    expect(describeErrorForLog(tokenExchangeError())).toBe(
      'AxiosError: Request failed with status code 403 | code=ERR_BAD_REQUEST | status=403 | request=POST https://nodered.local/auth/token'
    );
  });

  it('never includes the password, the Basic header or URL credentials', () => {
    const out = describeErrorForLog(tokenExchangeError());
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(BASIC);
    expect(out).not.toContain('admin:');
  });

  it('handles plain errors and non-Error values', () => {
    expect(describeErrorForLog(new Error('boom'))).toBe('Error: boom');
    expect(describeErrorForLog('plain')).toBe('plain');
    expect(describeErrorForLog({ password: PASSWORD })).toBe('non-Error value (object)');
  });

  it('keeps a relative request path without its query string', () => {
    const err = Object.assign(new Error('x'), {
      config: { method: 'get', url: '/flows?token=abc' },
    });
    expect(describeErrorForLog(err)).toBe('Error: x | request=GET /flows');
  });
});
