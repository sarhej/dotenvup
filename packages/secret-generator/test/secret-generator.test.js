import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimatePassphraseEntropyBits,
  estimatePasswordEntropyBits,
  generatePassphrase,
  generatePassword,
  randomUniformInt,
} from '../dist/index.js';

test('randomUniformInt stays within range', () => {
  for (let i = 0; i < 500; i++) {
    const x = randomUniformInt(7);
    assert.ok(x >= 0 && x < 7);
  }
});

test('generatePassword length and charset flags', () => {
  const onlyLower = generatePassword({
    length: 12,
    lowercase: true,
    uppercase: false,
    digits: false,
    symbols: false,
    avoidAmbiguous: false,
  });
  assert.equal(onlyLower.length, 12);
  assert.ok(/^[a-z]+$/.test(onlyLower));

  const mixed = generatePassword({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    avoidAmbiguous: true,
  });
  assert.equal(mixed.length, 20);
  assert.match(mixed, /[a-z]/);
  assert.match(mixed, /[A-Z]/);
  assert.match(mixed, /[0-9]/);
  assert.match(mixed, /[!@#$%^&*()\-_=+[\]{}<>?]/);
  assert.ok(!mixed.includes('I'));
  assert.ok(!mixed.includes('O'));
  assert.ok(!mixed.includes('0'));
  assert.ok(!mixed.includes('1'));
  assert.ok(!mixed.includes('l'));
});

test('generatePassphrase uses custom wordlist', () => {
  const phrase = generatePassphrase({
    wordCount: 4,
    separator: '_',
    wordlist: ['alpha', 'beta', 'gamma'],
  });
  const parts = phrase.split('_');
  assert.equal(parts.length, 4);
  for (const w of parts) assert.ok(['alpha', 'beta', 'gamma'].includes(w));
});

test('estimatePassphraseEntropyBits for EFF list', () => {
  const bits = estimatePassphraseEntropyBits(6, 7776);
  assert.ok(bits > 77 && bits < 78);
});

test('estimatePasswordEntropyBits', () => {
  const bits = estimatePasswordEntropyBits(16, 62);
  assert.ok(bits > 95 && bits < 96);
});
