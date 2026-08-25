import { describe, it, expect } from 'vitest';
import {
  parse,
  serialize,
  ParseError,
  parsePolicySection,
  serializePolicySection,
  validatePolicy,
  mergePolicyAware,
  filterRawForKeys,
  PolicyValidationError,
  SUPPORTED_POLICY_VERSION,
} from '../index.js';

const BASE_HEADER = `#!dotenvup v1
# Encrypted-By: @alice
# Encrypted-For: @alice, @bob
# Created: 2026-08-24T20:00:00Z
# Algorithm: x25519-xchacha20-poly1305

[keys]
DB_HOST    v1  2026-08-20T10:00:00Z  @alice
API_KEY    v1  2026-08-20T10:00:00Z  @alice
PROD_DB_URL v1 2026-08-20T10:00:00Z  @alice
JWT_SECRET v1  2026-08-20T10:00:00Z  @alice
`;

describe('parsePolicySection', () => {
  it('parses valid policy v1', () => {
    const policy = parsePolicySection([
      'version: 1',
      'recipient:@alice  keys:DB_HOST,API_KEY,PROD_DB_URL,JWT_SECRET',
      'recipient:@bob    keys:DB_HOST,API_KEY',
    ]);
    expect(policy.version).toBe(1);
    expect(policy.rows).toHaveLength(2);
    expect(policy.rows[1].keys).toEqual(['DB_HOST', 'API_KEY']);
  });

  it('rejects malformed row', () => {
    expect(() => parsePolicySection(['version: 1', 'recipient:@bob'])).toThrow(ParseError);
  });

  it('rejects empty keys list', () => {
    expect(() => parsePolicySection(['version: 1', 'recipient:@bob  keys:'])).toThrow(ParseError);
  });

  it('rejects duplicate recipient', () => {
    expect(() =>
      parsePolicySection([
        'version: 1',
        'recipient:@bob  keys:API_KEY',
        'recipient:@bob  keys:DB_HOST',
      ]),
    ).toThrow(ParseError);
  });

  it('rejects unsupported version on write path via assertPolicyWritable', async () => {
    const { assertPolicyWritable } = await import('../policy.js');
    expect(() => assertPolicyWritable({ version: 99, rows: [] })).toThrow();
  });

  it('PAR-05: parse accepts version 99; validate reports V1', () => {
    const policy = parsePolicySection(['version: 99', 'recipient:@local  keys:A']);
    expect(policy.version).toBe(99);
    const file = parse(`#!dotenvup v1
# Encrypted-By: @local
# Encrypted-For: @local
# Created: 2026-01-01T00:00:00Z

[keys]
A v1 2026-01-01T00:00:00Z @local

[policy]
version: 99
recipient:@local  keys:A

[encrypted]
recipient:@local  nonce:n  ephemeral:e  payload:p
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'V1')).toBe(true);
  });

  it('PAR-07: policy without encrypted blocks fails P3 on verify', () => {
    const file = parse(`#!dotenvup v1
# Encrypted-By: @local
# Encrypted-For: @local
# Created: 2026-01-01T00:00:00Z

[keys]
A v1 2026-01-01T00:00:00Z @local

[policy]
version: 1
recipient:@local  keys:A

[encrypted]
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'P3')).toBe(true);
  });
});

describe('parse [policy] in file', () => {
  it('round-trips policy section', () => {
    const content = `${BASE_HEADER}
[policy]
version: 1
recipient:@alice  keys:DB_HOST,API_KEY,PROD_DB_URL,JWT_SECRET
recipient:@bob  keys:DB_HOST,API_KEY

[encrypted]
recipient:@alice  nonce:n1  ephemeral:e1  payload:p1
recipient:@bob  nonce:n2  ephemeral:e2  payload:p2
`;
    const file = parse(content);
    expect(file.policy?.version).toBe(SUPPORTED_POLICY_VERSION);
    expect(file.policy?.rows).toHaveLength(2);
    const out = serialize(file);
    const reparsed = parse(out);
    expect(reparsed.policy).toEqual(file.policy);
  });

  it('ignores unknown sections', () => {
    const content = `${BASE_HEADER}
[signature]
signed-by:@alice

[encrypted]
recipient:@alice  nonce:n  ephemeral:e  payload:p
`;
    const file = parse(content);
    expect(file.policy).toBeUndefined();
    expect(file.encryptedBlocks).toHaveLength(1);
  });
});

describe('validatePolicy', () => {
  it('passes valid file', () => {
    const file = parse(`${BASE_HEADER}
[policy]
version: 1
recipient:@alice  keys:DB_HOST,API_KEY,PROD_DB_URL,JWT_SECRET
recipient:@bob  keys:DB_HOST,API_KEY

[encrypted]
recipient:@alice  nonce:n1  ephemeral:e1  payload:p1
recipient:@bob  nonce:n2  ephemeral:e2  payload:p2
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(true);
  });

  it('fails P1 when key not in catalog', () => {
    const file = parse(`${BASE_HEADER}
[policy]
version: 1
recipient:@bob  keys:MISSING_KEY

[encrypted]
recipient:@bob  nonce:n  ephemeral:e  payload:p
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'P1')).toBe(true);
  });

  it('fails P2 when encrypted block lacks policy row', () => {
    const file = parse(`${BASE_HEADER}
[policy]
version: 1
recipient:@alice  keys:DB_HOST

[encrypted]
recipient:@alice  nonce:n  ephemeral:e  payload:p
recipient:@bob  nonce:n2  ephemeral:e2  payload:p2
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'P2')).toBe(true);
  });

  it('fails P4 when Encrypted-For mismatches policy', () => {
    const content = `#!dotenvup v1
# Encrypted-By: @alice
# Encrypted-For: @alice
# Created: 2026-08-24T20:00:00Z
# Algorithm: x25519-xchacha20-poly1305

[keys]
DB_HOST    v1  2026-08-20T10:00:00Z  @alice

[policy]
version: 1
recipient:@alice  keys:DB_HOST
recipient:@bob  keys:DB_HOST

[encrypted]
recipient:@alice  nonce:n  ephemeral:e  payload:p
recipient:@bob  nonce:n2  ephemeral:e2  payload:p2
`;
    const result = validatePolicy(parse(content));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'P4')).toBe(true);
  });

  it('fails P3 when policy row lacks encrypted block', () => {
    const file = parse(`${BASE_HEADER}
[policy]
version: 1
recipient:@alice  keys:DB_HOST
recipient:@bob  keys:API_KEY

[encrypted]
recipient:@alice  nonce:n  ephemeral:e  payload:p
`);
    const result = validatePolicy(file);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'P3')).toBe(true);
  });
});

describe('mergePolicyAware', () => {
  it('merges editor slice', () => {
    const merged = mergePolicyAware(
      { DB_HOST: 'old', API_KEY: 'a' },
      { API_KEY: 'new' },
      new Set(['DB_HOST', 'API_KEY']),
    );
    expect(merged).toEqual({ API_KEY: 'new' });
  });

  it('removes keys dropped from .env in policy mode', () => {
    const merged = mergePolicyAware(
      { DB_HOST: 'h', API_KEY: 'a' },
      { DB_HOST: 'h' },
      new Set(['DB_HOST', 'API_KEY']),
    );
    expect(merged).toEqual({ DB_HOST: 'h' });
    expect(merged.API_KEY).toBeUndefined();
  });

  it('rejects foreign keys (M1)', () => {
    expect(() =>
      mergePolicyAware({ API_KEY: 'a' }, { JWT_SECRET: 'x' }, new Set(['API_KEY'])),
    ).toThrow(PolicyValidationError);
  });
});

describe('filterRawForKeys', () => {
  it('strips lines for keys outside policy', () => {
    const raw = `# db
DB_HOST=localhost
PROD_DB_URL=postgres://secret
API_KEY=token
`;
    const filtered = filterRawForKeys(raw, new Set(['DB_HOST', 'API_KEY']));
    expect(filtered).toContain('DB_HOST=localhost');
    expect(filtered).toContain('API_KEY=token');
    expect(filtered).not.toContain('PROD_DB_URL');
    expect(filtered).not.toContain('# db');
  });
});

describe('serializePolicySection', () => {
  it('produces parseable output', () => {
    const policy = {
      version: 1,
      rows: [{ recipient: '@ci', keys: ['API_KEY'] }],
    };
    const section = serializePolicySection(policy);
    expect(section).toContain('[policy]');
    const reparsed = parsePolicySection(section.split('\n').slice(1));
    expect(reparsed).toEqual(policy);
  });
});
