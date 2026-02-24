/**
 * Shared .env file parser and comparison utilities
 */

import { parse as dotenvParse } from 'dotenv';

export function parseEnvFile(content: string): Record<string, string> {
  const parsed = dotenvParse(normalize(content));
  // Extra normalization for common expectations in .env files:
  // dotenv expands \n in double-quoted strings, but it may preserve escaped quotes.
  for (const [k, v] of Object.entries(parsed)) {
    parsed[k] = v.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return parsed;
}

function normalize(content: string): string {
  // Strip UTF-8 BOM if present
  let c = content;
  if (c.length > 0 && c.charCodeAt(0) === 0xfeff) c = c.slice(1);

  // Support `export KEY=VALUE` lines by stripping the prefix
  const lines = c.split(/\r?\n/).map((line) => line.replace(/^\s*export\s+/, ''));
  return lines.join('\n');
}

/**
 * Extract comment and blank lines from raw .env content for use as structure in .env.up header.
 * Preserves header, section groupings (e.g. "# Database", "# API Keys") so .env.up can serve as an example.
 */
export function extractStructureComments(rawContent: string): string[] {
  const lines = rawContent.split(/\r?\n/);
  return lines.filter((line) => {
    const t = line.trim();
    return t === '' || t.startsWith('#');
  });
}

/**
 * Semantic comparison: same keys, same values (after normalization).
 * Used for drift detection between .env and decrypted .env.up.
 */
export function entriesMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));
  if (keysA.size !== keysB.size) return false;
  for (const k of keysA) {
    if (!keysB.has(k)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Compute diff summary: added, removed, changed keys
 */
export function entriesDiff(
  from: Record<string, string>,
  to: Record<string, string>
): { added: string[]; removed: string[]; changed: string[] } {
  const fromKeys = new Set(Object.keys(from));
  const toKeys = new Set(Object.keys(to));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const k of toKeys) {
    if (!fromKeys.has(k)) added.push(k);
    else if (from[k] !== to[k]) changed.push(k);
  }
  for (const k of fromKeys) {
    if (!toKeys.has(k)) removed.push(k);
  }

  return { added, removed, changed };
}
