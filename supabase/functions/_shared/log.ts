/**
 * Structured logging. Never pass secrets, signatures, tokens or personal data
 * (names, contact details) to these helpers — ids and codes only.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

export function logInfo(event: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ level: 'info', event, ...fields }));
}

export function logWarn(event: string, fields: Fields = {}): void {
  console.warn(JSON.stringify({ level: 'warn', event, ...fields }));
}

export function logError(event: string, fields: Fields = {}): void {
  console.error(JSON.stringify({ level: 'error', event, ...fields }));
}
