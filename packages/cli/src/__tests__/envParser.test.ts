/**
 * Unit tests for envParser
 */

import { describe, it, expect } from 'vitest';
import { parseEnvFile, entriesMatch, entriesDiff } from '../envParser.js';

describe('parseEnvFile', () => {
  it('parses simple KEY=VALUE', () => {
    expect(parseEnvFile('A=1')).toEqual({ A: '1' });
  });

  it('parses multiple lines', () => {
    expect(parseEnvFile('A=1\nB=2')).toEqual({ A: '1', B: '2' });
  });

  it('skips comments', () => {
    expect(parseEnvFile('# comment\nA=1')).toEqual({ A: '1' });
  });

  it('skips empty lines', () => {
    expect(parseEnvFile('\n\nA=1\n\n')).toEqual({ A: '1' });
  });

  it('handles quoted values', () => {
    expect(parseEnvFile('A="x"')).toEqual({ A: 'x' });
    expect(parseEnvFile("A='y'")).toEqual({ A: 'y' });
  });

  it('handles values with spaces', () => {
    expect(parseEnvFile('A="hello world"')).toEqual({ A: 'hello world' });
  });

  it('supports export KEY=VALUE syntax', () => {
    expect(parseEnvFile('export A=1\nexport B=2')).toEqual({ A: '1', B: '2' });
  });

  it('strips inline comments for unquoted values', () => {
    expect(parseEnvFile('A=1 #comment')).toEqual({ A: '1' });
  });

  it('handles escapes in double-quoted values', () => {
    expect(parseEnvFile('A="a\\"b"')).toEqual({ A: 'a"b' });
  });

  it('handles \\n escape in double-quoted values (multiline)', () => {
    const parsed = parseEnvFile('A="line1\\nline2"');
    expect(parsed.A).toBe('line1\nline2');
  });

  it('uses last value for duplicate keys', () => {
    expect(parseEnvFile('A=1\nA=2')).toEqual({ A: '2' });
  });

  it('handles CRLF', () => {
    expect(parseEnvFile('A=1\r\nB=2')).toEqual({ A: '1', B: '2' });
  });

  it('trims whitespace around key and value', () => {
    expect(parseEnvFile('  A  =  x  ')).toEqual({ A: 'x' });
  });
});

describe('entriesMatch', () => {
  it('matches identical entries', () => {
    expect(entriesMatch({ A: '1', B: '2' }, { A: '1', B: '2' })).toBe(true);
  });

  it('A=1 vs A="1" semantic equal', () => {
    const a = parseEnvFile('A=1');
    const b = parseEnvFile('A="1"');
    expect(entriesMatch(a, b)).toBe(true);
  });

  it('whitespace trimmed', () => {
    const a = parseEnvFile('A= x ');
    const b = parseEnvFile('A=x');
    expect(entriesMatch(a, b)).toBe(true);
  });

  it('multiline value in quotes', () => {
    const a = parseEnvFile('A="line1\\nline2"');
    const b = parseEnvFile('A="line1\\nline2"');
    expect(entriesMatch(a, b)).toBe(true);
  });

  it('fails when keys differ', () => {
    expect(entriesMatch({ A: '1' }, { A: '1', B: '2' })).toBe(false);
    expect(entriesMatch({ A: '1', B: '2' }, { A: '1' })).toBe(false);
  });

  it('fails when value differs', () => {
    expect(entriesMatch({ A: '1' }, { A: '2' })).toBe(false);
  });
});

describe('entriesDiff', () => {
  it('detects added keys', () => {
    const diff = entriesDiff({ A: '1' }, { A: '1', B: '2' });
    expect(diff.added).toEqual(['B']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('detects removed keys', () => {
    const diff = entriesDiff({ A: '1', B: '2' }, { A: '1' });
    expect(diff.removed).toEqual(['B']);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('detects changed values', () => {
    const diff = entriesDiff({ A: '1' }, { A: '2' });
    expect(diff.changed).toEqual(['A']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});
