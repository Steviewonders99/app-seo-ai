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
