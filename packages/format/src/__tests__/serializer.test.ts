import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../index.js';

describe('serialize', () => {
  it('roundtrips with parse', async () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Created: 2026-02-15T10:30:00Z

[keys]
DB_HOST v1 2026-02-15T10:30:00Z @local
API_KEY v1 2026-02-15T10:30:00Z @local  # test

[encrypted]
recipient:@local  nonce:abc  ephemeral:def  payload:ghi
`;
    const file = parse(content);
    const output = serialize(file);
    const reparsed = parse(output);
    expect(reparsed.header.formatVersion).toBe(file.header.formatVersion);
    expect(reparsed.header.encryptedBy).toBe(file.header.encryptedBy);
    expect(reparsed.header.keys).toHaveLength(file.header.keys.length);
    expect(reparsed.encryptedBlocks).toHaveLength(file.encryptedBlocks.length);
    expect(reparsed.encryptedBlocks[0].recipient).toBe(file.encryptedBlocks[0].recipient);
    expect(reparsed.encryptedBlocks[0].nonce).toBe(file.encryptedBlocks[0].nonce);
    expect(reparsed.encryptedBlocks[0].payload).toBe(file.encryptedBlocks[0].payload);
  });

  it('roundtrips header with structureComments (.env structure)', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Created: 2026-02-15T10:30:00Z

# --- .env structure (comments/grouping from original file) ---
# DotEnvUp sample – fake typical project secrets
# DO NOT use in production
#
# Database
# API Keys

[keys]
DB_HOST    v1  2026-02-15T10:30:00Z  @local

[encrypted]
recipient:@local  nonce:n  ephemeral:e  payload:p
`;
    const file = parse(content);
    expect(file.header.structureComments).toBeDefined();
    const output = serialize(file);
    const reparsed = parse(output);
    expect(reparsed.header.structureComments).toEqual(file.header.structureComments);
  });
});
