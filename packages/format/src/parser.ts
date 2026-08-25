/**
 * @dotenvup/format — Parser for .env.up file format
 */

import type { EnvUpFile, EnvUpHeader, EnvUpKey, EnvUpPolicy, EnvUpRecipientBlock } from './types.js';
import { ParseError } from './types.js';
import { FORMAT_MAGIC, FORMAT_VERSION } from './constants.js';
import { parsePolicySection } from './policy.js';

/** Parse header fields from # Key: Value lines */
function parseHeaderFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of lines) {
    if (!line.startsWith('#')) continue;
    const rest = line.slice(1).trim();
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) continue;
    const key = rest.slice(0, colonIdx).trim();
    const value = rest.slice(colonIdx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

/** Parse [keys] section: tab or whitespace separated columns (name, version, date, author, optional note) */
function parseKeysSection(lines: string[]): EnvUpKey[] {
  const keys: EnvUpKey[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('[')) break; // Next section

    // Split by any whitespace, but preserve # comment at end
    const hashIdx = line.indexOf('#');
    const dataPart = hashIdx >= 0 ? line.slice(0, hashIdx).trimEnd() : line;
    const notePart = hashIdx >= 0 ? line.slice(hashIdx + 1).trim() : undefined;

    const parts = dataPart.split(/\s+/).filter(Boolean);
    if (parts.length < 4) continue;

    const [name, versionStr, updatedAt, author] = parts;
    const version = parseVersion(versionStr);

    keys.push({
      name,
      version,
      updatedAt,
      author,
      note: notePart || undefined,
    });
  }
  return keys;
}

function parseVersion(s: string): number {
  const m = s.match(/^v?(\d+)$/i);
  return m ? parseInt(m[1], 10) : 1;
}

/** Parse [encrypted] section */
function parseEncryptedSection(lines: string[]): EnvUpRecipientBlock[] {
  const blocks: EnvUpRecipientBlock[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('[')) break;

    const pairs: Record<string, string> = {};
    const parts = line.split(/\s+/);
    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const key = part.slice(0, colonIdx);
      const value = part.slice(colonIdx + 1);
      pairs[key] = value;
    }

    const recipient = pairs['recipient'];
    const nonce = pairs['nonce'];
    const ephemeral = pairs['ephemeral'];
    const payload = pairs['payload'];

    if (!recipient || !nonce || !ephemeral || !payload) {
      throw new ParseError(`Invalid encrypted block: missing recipient, nonce, ephemeral, or payload`);
    }

    blocks.push({ recipient, nonce, ephemeral, payload });
  }
  return blocks;
}

/**
 * Parse the header of a .env.up file without decrypting values.
 */
export function parseHeader(content: string): EnvUpHeader {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) throw new ParseError('Empty file');

  const first = lines[0].trim();
  if (!first.startsWith(FORMAT_MAGIC)) {
    throw new ParseError(`Invalid magic line: expected "${FORMAT_MAGIC} v${FORMAT_VERSION}"`);
  }
  const versionMatch = first.match(/v(\d+)$/);
  const formatVersion = versionMatch ? parseInt(versionMatch[1], 10) : FORMAT_VERSION;

  let i = 1;
  const headerLines: string[] = [];
  while (i < lines.length && !lines[i].trim().startsWith('[')) {
    headerLines.push(lines[i]);
    i++;
  }

  const fields = parseHeaderFields([lines[0], ...headerLines]);
  const encryptedBy = fields['Encrypted-By'] || '@local';
  const createdAt = fields['Created'] || new Date().toISOString();
  const algorithm = fields['Algorithm'] || 'x25519-xchacha20-poly1305';
  const keyId = fields['Key-Id'] || undefined;
  const encryptedForStr = fields['Encrypted-For'];
  const encryptedFor = encryptedForStr
    ? encryptedForStr.split(',').map((s) => s.trim()).filter(Boolean)
    : [encryptedBy];

  // Optional structure block: # --- .env structure --- followed by comment/blank lines (rest of header before [keys])
  let structureComments: string[] | undefined;
  const structureMarker = '# --- .env structure (comments/grouping from original file) ---';
  const markerIdx = headerLines.findIndex((l) => l.trim() === structureMarker);
  if (markerIdx >= 0) {
    let block = headerLines.slice(markerIdx + 1);
    while (block.length > 0 && block[block.length - 1].trim() === '') block = block.slice(0, -1);
    structureComments = block.length > 0 ? block : undefined;
  }

  let keys: EnvUpKey[] = [];
  if (i < lines.length && lines[i].trim() === '[keys]') {
    i++;
    const keysLines: string[] = [];
    while (i < lines.length && !lines[i].trim().startsWith('[')) {
      keysLines.push(lines[i]);
      i++;
    }
    keys = parseKeysSection(keysLines);
  }

  return {
    formatVersion,
    encryptedBy,
    encryptedFor,
    keyId,
    createdAt,
    algorithm,
    structureComments,
    keys,
  };
}

/**
 * Parse a complete .env.up file (header + optional policy + encrypted blocks).
 */
export function parse(content: string): EnvUpFile {
  const header = parseHeader(content);

  const lines = content.split(/\r?\n/);
  let section: 'policy' | 'encrypted' | 'other' | null = null;
  const policyLines: string[] = [];
  const encryptedLines: string[] = [];

  for (const line of lines) {
    const trim = line.trim();
    if (trim === '[policy]') {
      section = 'policy';
      continue;
    }
    if (trim === '[encrypted]') {
      section = 'encrypted';
      continue;
    }
    if (trim.startsWith('[') && trim.endsWith(']')) {
      section = 'other';
      continue;
    }

    if (section === 'policy') policyLines.push(line);
    else if (section === 'encrypted') encryptedLines.push(line);
  }

  let policy: EnvUpPolicy | undefined;
  if (policyLines.length > 0) {
    policy = parsePolicySection(policyLines);
  }

  const encryptedBlocks = parseEncryptedSection(encryptedLines);

  return {
    header,
    policy,
    encryptedBlocks,
  };
}
