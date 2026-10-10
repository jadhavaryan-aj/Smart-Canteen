/**
 * CORS headers. Set ALLOWED_ORIGINS (comma separated) in production so only
 * your site can call the functions from a browser. When unset (local
 * development) any origin is allowed; the functions still require a valid JWT.
 */
export function corsHeaders(request: Request, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (allowedOrigins.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }
  const origin = request.headers.get('origin')?.replace(/\/+$/, '');
  headers['Vary'] = 'Origin';
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function preflight(request: Request, allowedOrigins: readonly string[]): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, allowedOrigins) });
}
