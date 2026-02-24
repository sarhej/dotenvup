/**
 * Debug logging and secret scrubbing
 */

const DEBUG = process.env.UP_DEBUG === '1' || process.env.DOTENVUP_DEBUG === '1';

const SECRET_PATTERNS = /password|secret|key|token|credential|auth/i;

export function info(msg: string): void {
  console.log(msg);
}

export function warn(msg: string): void {
  console.error('[up:warn]', scrubMessage(msg));
}

export function error(msg: string, err?: unknown): void {
  const scrubbedMsg = scrubMessage(msg);
  if (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[up:error] ${scrubbedMsg}: ${scrubMessage(errMsg)}`);
  } else {
    console.error(`[up:error] ${scrubbedMsg}`);
  }
}

export function debug(msg: string, data?: Record<string, unknown>): void {
  if (!DEBUG) return;
  const safe = data ? scrubObject(data) : {};
  console.error('[up:debug]', scrubMessage(msg), Object.keys(safe).length ? safe : '');
}

/**
 * Redact key names that look like secrets in a string.
 */
export function scrubMessage(msg: string): string {
  return msg.replace(/[A-Z0-9_]{3,}/g, (match) => {
    if (SECRET_PATTERNS.test(match)) return '[redacted]';
    return match;
  });
}

/**
 * Redact key names that look like secrets. Never log values.
 */
export function scrubSecret(key: string): string {
  if (SECRET_PATTERNS.test(key)) return '[redacted]';
  return key;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_PATTERNS.test(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = scrubObject(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
