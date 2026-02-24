/**
 * @dotenvup/format — Serializer for .env.up file format
 */

import type { EnvUpFile, EnvUpHeader } from './types.js';
import { FORMAT_MAGIC } from './constants.js';

const COLUMN_WIDTHS = {
  name: 24,
  version: 6,
  updatedAt: 24,
  author: 12,
};

const AI_AGENT_CONTEXT = [
  '#',
  '# AI-AGENT-CONTEXT:',
  '# This file contains encrypted environment secrets (.env.up format).',
  '# The plaintext .env may not exist on disk — it is "locked" by default.',
  '# Do NOT assume .env exists. Use `up run -- <command>` to run with decrypted env.',
  '# Use `up status` to check lock state. Never log or expose decrypted values.',
  '# VS Code/Cursor: run "DotEnvUp: Key Management" for local key backup/restore.',
  '# Backup restore: copy .env.up.bak-<timestamp> over .env.up, then run unlock.',
  '# To edit secrets: up unlock -> edit .env -> up import -> up lock',
  '#',
  '# Git-safe: Safe to commit this file. Key names are visible in the header;',
  '# values are encrypted. New developers see which keys exist without the decryption key.',
  '# Docs: https://github.com/sarhej/dotenvup',
];

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/**
 * Serialize header only (for display/diff).
 */
export function serializeHeader(header: EnvUpHeader): string {
  const lines: string[] = [];
  lines.push(`${FORMAT_MAGIC} v${header.formatVersion}`);
  lines.push(`# Encrypted-By: ${header.encryptedBy}`);
  lines.push(`# Created: ${header.createdAt}`);
  lines.push(`# Algorithm: ${header.algorithm}`);
  if (header.encryptedFor.length > 0) {
    lines.push(`# Encrypted-For: ${header.encryptedFor.join(', ')}`);
  }
  if (header.keyId) {
    lines.push(`# Key-Id: ${header.keyId}`);
  }
  lines.push(...AI_AGENT_CONTEXT);
  lines.push('');
  if (header.structureComments && header.structureComments.length > 0) {
    lines.push('# --- .env structure (comments/grouping from original file) ---');
    lines.push(...header.structureComments);
    const lastIsBlank = header.structureComments[header.structureComments.length - 1].trim() === '';
    if (!lastIsBlank) lines.push('');
  }
  lines.push('[keys]');

  for (const key of header.keys) {
    const versionStr = key.version === 1 ? 'v1' : `v${key.version}`;
    const row =
      pad(key.name, COLUMN_WIDTHS.name) +
      ' ' +
      pad(versionStr, COLUMN_WIDTHS.version) +
      ' ' +
      pad(key.updatedAt, COLUMN_WIDTHS.updatedAt) +
      ' ' +
      pad(key.author, COLUMN_WIDTHS.author);
    const withNote = key.note ? `${row}  # ${key.note}` : row;
    lines.push(withNote);
  }

  return lines.join('\n');
}

/**
 * Serialize an EnvUpFile to the .env.up text format.
 */
export function serialize(file: EnvUpFile): string {
  const headerStr = serializeHeader(file.header);
  const lines: string[] = [headerStr, '', '[encrypted]'];

  for (const block of file.encryptedBlocks) {
    const line = `recipient:${block.recipient}  nonce:${block.nonce}  ephemeral:${block.ephemeral}  payload:${block.payload}`;
    lines.push(line);
  }

  return lines.join('\n') + '\n';
}
