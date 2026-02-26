/**
 * Merge two .env-style contents (e.g. from .env and decrypted .env.up).
 * Produces one string with one active value per key; conflicts add a comment line.
 */

import { parseEnvFile } from '@dotenvup/format';

function formatEnv(key: string, val: string): string {
  if (val.includes('"') || val.includes('\n') || val.includes(' ')) {
    return `${key}="${val.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${val}`;
}

export type MergePrefer = 'env' | 'envUp';

/**
 * Merge envContent (.env file) and envUpContent (decrypted .env.up or raw).
 * - prefer 'env': for each key use .env value if present, else .env.up; on conflict add comment "# KEY (from .env.up): value".
 * - prefer 'envUp': use .env.up value; on conflict add comment "# KEY (from .env): value".
 * Returns a single .env-format string (only active lines are parsed into entries; comments are human-only).
 */
export function mergeEnvContent(
  envContent: string,
  envUpContent: string,
  prefer: MergePrefer
): string {
  const envEntries = parseEnvFile(envContent);
  const envUpEntries = parseEnvFile(envUpContent);
  const allKeys = new Set<string>([...Object.keys(envEntries), ...Object.keys(envUpEntries)]);
  const lines: string[] = [];
  for (const key of [...allKeys].sort()) {
    const fromEnv = envEntries[key];
    const fromEnvUp = envUpEntries[key];
    const hasBoth = fromEnv !== undefined && fromEnvUp !== undefined;
    const conflict = hasBoth && fromEnv !== fromEnvUp;

    if (prefer === 'env') {
      const active = fromEnv !== undefined ? fromEnv : fromEnvUp!;
      lines.push(formatEnv(key, active));
      if (conflict) {
        lines.push(`# ${key} (from .env.up): ${fromEnvUp}`);
      }
    } else {
      const active = fromEnvUp !== undefined ? fromEnvUp : fromEnv!;
      lines.push(formatEnv(key, active));
      if (conflict) {
        lines.push(`# ${key} (from .env): ${fromEnv}`);
      }
    }
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}
