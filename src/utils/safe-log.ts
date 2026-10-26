/**
 * Turn a thrown value into a one-line description that is safe to log.
 *
 * Logging an AxiosError as-is prints its whole `config`, including the request
 * body and headers. For the /auth/token exchange the body holds the Node-RED
 * password, and on other requests the Authorization header holds a Bearer
 * token or a Basic header that decodes to username:password. This keeps only
 * the error's name, message, code, HTTP status and the request's method and
 * path.
 */
export function describeErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : `non-Error value (${typeof error})`;
  }

  const parts: string[] = [`${error.name}: ${error.message}`];
  const e = error as Error & {
    code?: unknown;
    response?: { status?: unknown };
    config?: { method?: unknown; url?: unknown };
  };

  if (typeof e.code === 'string') parts.push(`code=${e.code}`);
  if (typeof e.response?.status === 'number') parts.push(`status=${e.response.status}`);

  const method = typeof e.config?.method === 'string' ? e.config.method.toUpperCase() : undefined;
  const path = typeof e.config?.url === 'string' ? stripUrl(e.config.url) : undefined;
  if (method || path) parts.push(`request=${[method, path].filter(Boolean).join(' ')}`);

  return parts.join(' | ');
}

/** Drop userinfo, query string and fragment, which can all carry secrets. */
function stripUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? '';
  }
}
