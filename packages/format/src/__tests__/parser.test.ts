import { describe, it, expect } from 'vitest';
import { parseHeader, parse, ParseError } from '../index.js';

describe('parseHeader', () => {
  it('parses valid header with keys', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Created: 2026-02-15T10:30:00Z
# Algorithm: x25519-xchacha20-poly1305

[keys]
DB_HOST    v1  2026-02-15T10:30:00Z  @local
DB_PASSWORD v1 2026-02-15T10:30:00Z @local  # rotated
`;
    const header = parseHeader(content);
    expect(header.formatVersion).toBe(1);
    expect(header.encryptedBy).toBe('@local');
    expect(header.createdAt).toBe('2026-02-15T10:30:00Z');
    expect(header.algorithm).toBe('x25519-xchacha20-poly1305');
    expect(header.keys).toHaveLength(2);
    expect(header.keys[0]).toEqual({ name: 'DB_HOST', version: 1, updatedAt: '2026-02-15T10:30:00Z', author: '@local' });
    expect(header.keys[1]).toEqual({ name: 'DB_PASSWORD', version: 1, updatedAt: '2026-02-15T10:30:00Z', author: '@local', note: 'rotated' });
  });

  it('throws on invalid magic line', () => {
    expect(() => parseHeader('invalid')).toThrow(ParseError);
    expect(() => parseHeader('#!dotenv v1')).toThrow(ParseError);
  });

  it('parses header with Encrypted-For', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @alice
# Encrypted-For: @bob, @charlie
# Created: 2026-02-15T10:30:00Z

[keys]
`;
    const header = parseHeader(content);
    expect(header.encryptedFor).toEqual(['@bob', '@charlie']);
  });

  it('parses header with Key-Id', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Key-Id: abc123XYz
# Created: 2026-02-15T10:30:00Z

[keys]
`;
    const header = parseHeader(content);
    expect(header.keyId).toBe('abc123XYz');
  });

  it('parses empty keys section', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local

[keys]

[encrypted]
`;
    const header = parseHeader(content);
    expect(header.keys).toHaveLength(0);
  });

  it('parses optional .env structure block (comments/grouping)', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Created: 2026-02-15T10:30:00Z

# --- .env structure (comments/grouping from original file) ---
# DotEnvUp sample – fake typical project secrets
# DO NOT use these values in production
#
# Database
# API Keys
# Auth / Session

[keys]
DB_HOST    v1  2026-02-15T10:30:00Z  @local
API_KEY    v1  2026-02-15T10:30:00Z  @local
`;
    const header = parseHeader(content);
    expect(header.structureComments).toBeDefined();
    expect(header.structureComments).toEqual([
      '# DotEnvUp sample – fake typical project secrets',
      '# DO NOT use these values in production',
      '#',
      '# Database',
      '# API Keys',
      '# Auth / Session',
    ]);
    expect(header.keys).toHaveLength(2);
  });
});

describe('parse', () => {
  it('parses full file with encrypted block', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @local
# Created: 2026-02-15T10:30:00Z

[keys]
KEY v1 2026-02-15T10:30:00Z @local

[encrypted]
recipient:@local  nonce:abc  ephemeral:def  payload:ghi
`;
    const file = parse(content);
    expect(file.header.keys).toHaveLength(1);
    expect(file.encryptedBlocks).toHaveLength(1);
    expect(file.encryptedBlocks[0]).toEqual({
      recipient: '@local',
      nonce: 'abc',
      ephemeral: 'def',
      payload: 'ghi',
    });
  });

  it('parses multiple recipient blocks', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @alice

[keys]
KEY v1 2026-02-15T10:30:00Z @alice

[encrypted]
recipient:@bob  nonce:n1  ephemeral:e1  payload:p1
recipient:@charlie  nonce:n2  ephemeral:e2  payload:p2
`;
    const file = parse(content);
    expect(file.encryptedBlocks).toHaveLength(2);
    expect(file.encryptedBlocks[0].recipient).toBe('@bob');
    expect(file.encryptedBlocks[1].recipient).toBe('@charlie');
  });
});
