/**
 * @dotenvup/secret-generator — MIT. Uses globalThis.crypto.getRandomValues.
 * EFF Large Wordlist (CC0) bundled from data/eff-large-wordlist.json
 */
import effLargeWordlist from '../data/eff-large-wordlist.json' with { type: 'json' };

export const EFF_LARGE_WORDLIST_SIZE = 7776;

export const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{}<>?';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error(
      '@dotenvup/secret-generator requires crypto.getRandomValues (use HTTPS or localhost)'
    );
  }
  return c;
}

export function randomBytes(length) {
  const out = new Uint8Array(length);
  getCrypto().getRandomValues(out);
  return out;
}

/**
 * Uniform integer in [0, maxExclusive) — rejection sampling, no modulo bias.
 */
export function randomUniformInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new Error('randomUniformInt: maxExclusive must be a positive integer');
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  const crypto = getCrypto();
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

function filterAmbiguous(str) {
  const bad = new Set(['I', 'l', '1', 'O', '0']);
  return [...str].filter((c) => !bad.has(c)).join('');
}

function pickCharFromCharset(charset) {
  if (charset.length === 0) throw new Error('empty charset');
  const i = randomUniformInt(charset.length);
  return charset[i];
}

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomUniformInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Unique chars preserve order (first occurrence wins). */
function uniqueCharsOrdered(str) {
  const seen = new Set();
  let out = '';
  for (const ch of str) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
}

/**
 * @param {object} [options]
 * @param {number} [options.length=16]
 * @param {boolean} [options.lowercase=true]
 * @param {boolean} [options.uppercase=true]
 * @param {boolean} [options.digits=true]
 * @param {boolean} [options.symbols=true]
 * @param {string} [options.symbolsCharset]
 * @param {boolean} [options.avoidAmbiguous=true]
 */
export function generatePassword(options = {}) {
  const {
    length = 16,
    lowercase = true,
    uppercase = true,
    digits = true,
    symbols = true,
    symbolsCharset = DEFAULT_SYMBOLS,
    avoidAmbiguous = true,
  } = options;

  if (!Number.isInteger(length) || length < 4 || length > 256) {
    throw new Error('generatePassword: length must be an integer from 4 to 256');
  }

  let lowerPool = LOWER;
  let upperPool = UPPER;
  let digitPool = DIGITS;
  if (avoidAmbiguous) {
    lowerPool = filterAmbiguous(lowerPool);
    upperPool = filterAmbiguous(upperPool);
    digitPool = filterAmbiguous(digitPool);
  }

  const pools = [];
  if (lowercase) pools.push(lowerPool);
  if (uppercase) pools.push(upperPool);
  if (digits) pools.push(digitPool);
  if (symbols) pools.push(symbolsCharset);

  if (pools.length === 0) {
    throw new Error('generatePassword: enable at least one character set');
  }

  if (length < pools.length) {
    throw new Error(
      `generatePassword: length must be >= number of enabled character sets (${pools.length})`
    );
  }

  for (const p of pools) {
    if (p.length === 0) {
      throw new Error(
        'generatePassword: one of the enabled pools is empty (try turning off avoid ambiguous)'
      );
    }
  }

  const charset = uniqueCharsOrdered(pools.join(''));
  if (charset.length === 0) throw new Error('generatePassword: resulting charset is empty');

  const required = pools.map((pool) => pickCharFromCharset(pool));
  const positions = shuffleIndices(length);
  const out = new Array(length);

  required.forEach((ch, idx) => {
    out[positions[idx]] = ch;
  });

  for (let i = required.length; i < length; i++) {
    out[positions[i]] = pickCharFromCharset(charset);
  }

  return out.join('');
}

/**
 * @param {object} [options]
 * @param {number} [options.wordCount=6]
 * @param {string} [options.separator="-"]
 * @param {string[]} [options.wordlist] — defaults to bundled EFF Large Wordlist
 */
export function generatePassphrase(options = {}) {
  const { wordCount = 6, separator = '-', wordlist = effLargeWordlist } = options;

  if (!Number.isInteger(wordCount) || wordCount < 3 || wordCount > 32) {
    throw new Error('generatePassphrase: wordCount must be an integer from 3 to 32');
  }
  if (!Array.isArray(wordlist) || wordlist.length < 2) {
    throw new Error('generatePassphrase: wordlist must be an array of at least 2 words');
  }

  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = randomUniformInt(wordlist.length);
    words.push(wordlist[idx]);
  }
  return words.join(separator);
}

/** Charset size used by generatePassword (for entropy UI). */
export function effectivePasswordCharsetSize(options = {}) {
  const {
    lowercase = true,
    uppercase = true,
    digits = true,
    symbols = true,
    symbolsCharset = DEFAULT_SYMBOLS,
    avoidAmbiguous = true,
  } = options;

  let lowerPool = LOWER;
  let upperPool = UPPER;
  let digitPool = DIGITS;
  if (avoidAmbiguous) {
    lowerPool = filterAmbiguous(lowerPool);
    upperPool = filterAmbiguous(upperPool);
    digitPool = filterAmbiguous(digitPool);
  }

  const pools = [];
  if (lowercase) pools.push(lowerPool);
  if (uppercase) pools.push(upperPool);
  if (digits) pools.push(digitPool);
  if (symbols) pools.push(symbolsCharset);

  if (pools.length === 0) return 0;
  for (const p of pools) {
    if (p.length === 0) return 0;
  }
  return uniqueCharsOrdered(pools.join('')).length;
}

export function estimatePasswordEntropyBits(length, charsetSize) {
  if (!Number.isFinite(length) || !Number.isFinite(charsetSize) || length < 1 || charsetSize < 2) {
    return 0;
  }
  return length * (Math.log(charsetSize) / Math.LN2);
}

export function estimatePassphraseEntropyBits(wordCount, wordlistSize = EFF_LARGE_WORDLIST_SIZE) {
  if (!Number.isFinite(wordCount) || !Number.isFinite(wordlistSize) || wordCount < 1 || wordlistSize < 2) {
    return 0;
  }
  return wordCount * (Math.log(wordlistSize) / Math.LN2);
}
