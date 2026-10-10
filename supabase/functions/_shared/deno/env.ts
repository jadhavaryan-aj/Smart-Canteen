/** Deno-only environment helpers (Edge Functions runtime). */
import { parseAllowedOrigins } from '../config.ts';

export function getEnv(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function allowedOrigins(): string[] {
  return parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
}
