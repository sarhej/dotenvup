/**
 * Merge utility tests for mergeEnvContent.
 */

import * as assert from 'assert';
import { mergeEnvContent } from '../../mergeEnv';
import { parseEnvFile } from '@dotenvup/format';

suite('mergeEnvContent', () => {
  test('same key same value — single line', () => {
    const env = 'KEY=foo';
    const envUp = 'KEY=foo';
    const merged = mergeEnvContent(env, envUp, 'env');
    assert.ok(merged.includes('KEY=foo'));
    assert.ok(!merged.includes('from .env'));
    assert.ok(!merged.includes('from .env.up'));
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.KEY, 'foo');
  });

  test('same key different value — prefer env: active from .env, comment from .env.up', () => {
    const env = 'KEY=local';
    const envUp = 'KEY=remote';
    const merged = mergeEnvContent(env, envUp, 'env');
    assert.ok(merged.includes('KEY=local'));
    assert.ok(merged.includes('# KEY (from .env.up): remote'));
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.KEY, 'local');
  });

  test('same key different value — prefer envUp: active from .env.up, comment from .env', () => {
    const env = 'KEY=local';
    const envUp = 'KEY=remote';
    const merged = mergeEnvContent(env, envUp, 'envUp');
    assert.ok(merged.includes('KEY=remote'));
    assert.ok(merged.includes('# KEY (from .env): local'));
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.KEY, 'remote');
  });

  test('key only in .env', () => {
    const env = 'ALONE=value';
    const envUp = '';
    const merged = mergeEnvContent(env, envUp, 'env');
    assert.ok(merged.includes('ALONE=value'));
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.ALONE, 'value');
  });

  test('key only in .env.up', () => {
    const env = '';
    const envUp = 'ONLY_UP=secret';
    const merged = mergeEnvContent(env, envUp, 'env');
    assert.ok(merged.includes('ONLY_UP=secret'));
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.ONLY_UP, 'secret');
  });

  test('multiple keys: union and deterministic order', () => {
    const env = 'A=1\nC=3';
    const envUp = 'B=2\nC=3';
    const merged = mergeEnvContent(env, envUp, 'env');
    const entries = parseEnvFile(merged);
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, '2');
    assert.strictEqual(entries.C, '3');
    // Keys sorted: A, B, C
    const lines = merged.trim().split('\n').filter((l) => !l.startsWith('#'));
    assert.strictEqual(lines[0], 'A=1');
    assert.strictEqual(lines[1], 'B=2');
    assert.strictEqual(lines[2], 'C=3');
  });

  test('empty inputs returns empty string with newline', () => {
    const merged = mergeEnvContent('', '', 'env');
    assert.strictEqual(merged, '');
  });
});
