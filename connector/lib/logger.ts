/**
 * One-line structured JSON logger to stdout/stderr.
 * Vercel ingests stdout/stderr automatically — no transport needed.
 */

type Level = 'info' | 'warn' | 'error';

interface LogFields {
  tool?: string;
  status?: number;
  latencyMs?: number;
  keyword?: string;
  keywordCount?: number;
  err?: string;
}

export function log(level: Level, msg: string, fields: LogFields = {}): void {
  const entry = { ts: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

/**
 * Redact anything that looks like a secret out of free-text strings before
 * we log them or return them to a tool caller. Conservative: matches long
 * hex/base64-ish runs that fit the shape of bearer tokens, developer tokens,
 * and OAuth refresh tokens. Over-matching is acceptable; silently leaking
 * a token is not.
 */
const SECRET_PATTERN = /\b[A-Za-z0-9_\-]{20,}\b/g;

export function sanitize(text: string): string {
  return text.replace(SECRET_PATTERN, '[redacted]');
}
