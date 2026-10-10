export interface AuthUser {
  id: string;
  isAnonymous: boolean;
}

/** Resolves the caller from the request's bearer token, or null if unauthenticated. */
export type Authenticator = (request: Request) => Promise<AuthUser | null>;

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9\-_.=]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
