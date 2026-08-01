/**
 * Identity envelope — encrypt private key under a random wrapping key.
 *
 * M1: wrap.source = "file" (wrapping-key next to identity.enc).
 * M2+: wrap.source = "keychain" via native helper (same envelope shape).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Keypair } from './keyProvider.js';
import { initSodium, keyFingerprint } from './crypto.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sodium: any = null;

export const IDENTITY_ENVELOPE_FORMAT = 'dotenvup-identity-envelope';
export const IDENTITY_ENVELOPE_VERSION = 1;
export const IDENTITY_ENVELOPE_FILE = 'identity.enc';
export const WRAPPING_KEY_FILE = 'wrapping-key';
export const PLAINTEXT_IDENTITY_FILE = 'identity';
export const PUBLIC_IDENTITY_FILE = 'identity.pub';
export const RECOVERY_DIR = 'recovery';
export const ARCHIVE_DIR = 'archive';

const CIPHER_NAME = 'xchacha20-poly1305';

export type WrapSource = 'file' | 'keychain';

export interface IdentityEnvelopeV1 {
  format: typeof IDENTITY_ENVELOPE_FORMAT;
  version: 1;
  keyId: string;
  createdAt: string;
  wrap: {
    source: WrapSource;
    /** Relative path under identity dir when source=file */
    path?: string;
    service?: string;
    account?: string;
  };
  cipher: {
    name: typeof CIPHER_NAME;
    nonce: string;
    ciphertext: string;
  };
}

async function getSodium() {
  if (!sodium) {
    const lib = await import('libsodium-wrappers');
    await lib.ready;
    sodium = lib.default;
  }
  return sodium!;
}

function aeadAdditionalData(keyId: string): Uint8Array {
  return Buffer.from(`${IDENTITY_ENVELOPE_FORMAT}|${IDENTITY_ENVELOPE_VERSION}|${keyId}`, 'utf8');
}

function validateEnvelope(raw: unknown): asserts raw is IdentityEnvelopeV1 {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid identity envelope.');
  const e = raw as Record<string, unknown>;
  if (e['format'] !== IDENTITY_ENVELOPE_FORMAT) throw new Error('Invalid identity envelope format.');
  if (e['version'] !== IDENTITY_ENVELOPE_VERSION) throw new Error('Unsupported identity envelope version.');
  if (typeof e['keyId'] !== 'string' || !e['keyId']) throw new Error('Invalid identity envelope keyId.');
  const wrap = e['wrap'];
  if (!wrap || typeof wrap !== 'object') throw new Error('Invalid identity envelope wrap block.');
  const wrapObj = wrap as Record<string, unknown>;
  if (wrapObj['source'] !== 'file' && wrapObj['source'] !== 'keychain') {
    throw new Error('Invalid identity envelope wrap.source.');
  }
  const cipher = e['cipher'];
  if (!cipher || typeof cipher !== 'object') throw new Error('Invalid identity envelope cipher block.');
  const c = cipher as Record<string, unknown>;
  if (c['name'] !== CIPHER_NAME || typeof c['nonce'] !== 'string' || typeof c['ciphertext'] !== 'string') {
    throw new Error('Invalid identity envelope cipher parameters.');
  }
}

export function parseIdentityEnvelope(content: string): IdentityEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Identity envelope is not valid JSON.');
  }
  validateEnvelope(parsed);
  return parsed;
}

export async function sealIdentity(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  wrappingKey: Uint8Array,
  wrap: IdentityEnvelopeV1['wrap'],
): Promise<IdentityEnvelopeV1> {
  await initSodium();
  const s = await getSodium();
  if (privateKey.length !== 32 || publicKey.length !== 32) {
    throw new Error('Keypair must contain 32-byte public and private keys.');
  }
  if (wrappingKey.length !== 32) {
    throw new Error('Wrapping key must be 32 bytes.');
  }

  const keyId = await keyFingerprint(publicKey);
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ad = aeadAdditionalData(keyId);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    privateKey,
    ad,
    null,
    nonce,
    wrappingKey,
  );

  return {
    format: IDENTITY_ENVELOPE_FORMAT,
    version: IDENTITY_ENVELOPE_VERSION,
    keyId,
    createdAt: new Date().toISOString(),
    wrap,
    cipher: {
      name: CIPHER_NAME,
      nonce: s.to_base64(nonce),
      ciphertext: s.to_base64(ciphertext),
    },
  };
}

export async function unsealIdentity(
  envelope: IdentityEnvelopeV1,
  wrappingKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<Uint8Array> {
  await initSodium();
  const s = await getSodium();
  validateEnvelope(envelope);
  if (wrappingKey.length !== 32) {
    throw new Error('Wrapping key must be 32 bytes.');
  }
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes.');
  }

  const expectedKeyId = await keyFingerprint(publicKey);
  if (envelope.keyId !== expectedKeyId) {
    throw new Error('Identity envelope keyId does not match public key.');
  }

  const nonce = s.from_base64(envelope.cipher.nonce);
  const ciphertext = s.from_base64(envelope.cipher.ciphertext);
  const ad = aeadAdditionalData(envelope.keyId);

  let privateKey: Uint8Array;
  try {
    privateKey = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      ad,
      nonce,
      wrappingKey,
    ) as Uint8Array;
  } catch {
    throw new Error('Failed to decrypt identity envelope (wrong wrapping key or corrupted file).');
  }

  if (!privateKey || privateKey.length !== 32) {
    throw new Error('Failed to decrypt identity envelope (invalid private key length).');
  }

  const derivedPub = s.crypto_scalarmult_base(privateKey) as Uint8Array;
  if (derivedPub.length !== 32) {
    throw new Error('Identity envelope integrity check failed.');
  }
  for (let i = 0; i < 32; i++) {
    if (derivedPub[i] !== publicKey[i]) {
      throw new Error('Identity envelope integrity check failed (public/private mismatch).');
    }
  }

  return privateKey;
}

async function writeAtomic(filePath: string, data: string | Buffer, mode: number): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmp, data, { mode });
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, mode);
}

export async function writeFileWrappingKey(identityDir: string, wrappingKey: Uint8Array): Promise<string> {
  const filePath = path.join(identityDir, WRAPPING_KEY_FILE);
  await writeAtomic(filePath, Buffer.from(wrappingKey), 0o600);
  return WRAPPING_KEY_FILE;
}

export async function readFileWrappingKey(identityDir: string, relativePath = WRAPPING_KEY_FILE): Promise<Uint8Array> {
  const filePath = path.join(identityDir, relativePath);
  const buf = await fs.readFile(filePath);
  if (buf.length !== 32) {
    throw new Error('Wrapping key file must be exactly 32 bytes.');
  }
  return new Uint8Array(buf);
}

export async function writeIdentityEnvelope(identityDir: string, envelope: IdentityEnvelopeV1): Promise<void> {
  const filePath = path.join(identityDir, IDENTITY_ENVELOPE_FILE);
  await writeAtomic(filePath, JSON.stringify(envelope, null, 2) + '\n', 0o600);
}

export async function readIdentityEnvelope(identityDir: string): Promise<IdentityEnvelopeV1 | null> {
  try {
    const content = await fs.readFile(path.join(identityDir, IDENTITY_ENVELOPE_FILE), 'utf8');
    return parseIdentityEnvelope(content);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    // Corrupt / unsupported envelope must not brick plaintext fallback.
    return null;
  }
}

export type KeyStorageMode = 'plaintext' | 'file-envelope' | 'keychain' | 'absent';

/**
 * Reports the *usable* storage mode.
 * Envelope wins only if it decrypts; otherwise plaintext is reported if present
 * so a broken mid-migrate envelope never looks like "no key".
 * Keychain mode is reported when the envelope declares wrap.source=keychain
 * (even if the session is cold / prompt would be needed).
 */
export async function detectKeyStorageMode(identityDir: string): Promise<KeyStorageMode> {
  const envelope = await readIdentityEnvelope(identityDir);
  if (envelope?.wrap.source === 'keychain') {
    return 'keychain';
  }

  const fromEnvelope = await loadKeypairEnvelope(identityDir);
  if (fromEnvelope) return 'file-envelope';
  try {
    await fs.access(path.join(identityDir, PLAINTEXT_IDENTITY_FILE));
    return 'plaintext';
  } catch {
    return 'absent';
  }
}

async function assertKeypairConsistent(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  await initSodium();
  const s = await getSodium();
  if (privateKey.length !== 32 || publicKey.length !== 32) {
    throw new Error('Keypair must contain 32-byte public and private keys.');
  }
  const derived = s.crypto_scalarmult_base(privateKey) as Uint8Array;
  for (let i = 0; i < 32; i++) {
    if (derived[i] !== publicKey[i]) {
      throw new Error('Keypair integrity check failed (public/private mismatch).');
    }
  }
}

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Persist keypair as identity.enc + file wrapping key + identity.pub.
 * By default removes plaintext `identity` only after the envelope is written.
 */
export async function saveKeypairEnvelope(
  identityDir: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  options?: { removePlaintext?: boolean },
): Promise<IdentityEnvelopeV1> {
  await initSodium();
  const s = await getSodium();
  await assertKeypairConsistent(publicKey, privateKey);
  await fs.mkdir(identityDir, { recursive: true, mode: 0o700 });

  const wrappingKey = s.randombytes_buf(32) as Uint8Array;
  const relativeWrapPath = await writeFileWrappingKey(identityDir, wrappingKey);
  const envelope = await sealIdentity(privateKey, publicKey, wrappingKey, {
    source: 'file',
    path: relativeWrapPath,
  });
  await writeIdentityEnvelope(identityDir, envelope);
  await writeAtomic(
    path.join(identityDir, PUBLIC_IDENTITY_FILE),
    Buffer.from(publicKey).toString('base64') + '\n',
    0o644,
  );

  const removePlaintext = options?.removePlaintext !== false;
  if (removePlaintext) {
    try {
      await fs.unlink(path.join(identityDir, PLAINTEXT_IDENTITY_FILE));
    } catch {
      // absent is fine
    }
  }

  return envelope;
}

export async function loadKeypairEnvelope(
  identityDir: string,
  options?: { allowFileFallbackForKeychain?: boolean },
): Promise<Keypair | null> {
  const envelope = await readIdentityEnvelope(identityDir);
  if (!envelope) return null;

  let pubRaw: string;
  try {
    pubRaw = await fs.readFile(path.join(identityDir, PUBLIC_IDENTITY_FILE), 'utf8');
  } catch {
    return null;
  }
  const publicKey = new Uint8Array(Buffer.from(pubRaw.trim(), 'base64'));
  if (publicKey.length !== 32) return null;

  const wrapPath = envelope.wrap.path ?? WRAPPING_KEY_FILE;
  let wrappingKey: Uint8Array | null = null;

  if (envelope.wrap.source === 'keychain') {
    const account = envelope.wrap.account ?? envelope.keyId;
    const {
      getWrappingKeyFromKeychain,
      AuthCancelledError,
      NonInteractiveKeychainError,
      resolveKeychainHelper,
    } = await import('./keychainHelper.js');
    const { sessionGet, sessionPut } = await import('./sessionAgent.js');

    // Warm session: no Touch ID prompt.
    const warm = await sessionGet(envelope.keyId);
    if (warm) return warm;

    try {
      wrappingKey = await getWrappingKeyFromKeychain(account);
    } catch (err) {
      if (err instanceof AuthCancelledError || err instanceof NonInteractiveKeychainError) {
        throw err;
      }
      // Rollback safety: if wrapping-key file still exists, use it.
      const allowFallback = options?.allowFileFallbackForKeychain !== false;
      if (allowFallback) {
        try {
          wrappingKey = await readFileWrappingKey(identityDir, wrapPath);
        } catch {
          wrappingKey = null;
        }
      }
      if (!wrappingKey) {
        const helper = await resolveKeychainHelper();
        if (!helper) return null;
        throw err;
      }
    }

    try {
      const privateKey = await unsealIdentity(envelope, wrappingKey, publicKey);
      const kp = { publicKey, privateKey };
      // Best-effort: cache for the rest of the session (M3).
      try {
        await sessionPut(envelope.keyId, kp);
      } catch {
        // ignore agent failures
      }
      return kp;
    } catch {
      return null;
    }
  } else if (envelope.wrap.source === 'file') {
    try {
      wrappingKey = await readFileWrappingKey(identityDir, wrapPath);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  try {
    const privateKey = await unsealIdentity(envelope, wrappingKey, publicKey);
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

/**
 * Move wrapping key from file → Keychain. Same Key-Id; fail-safe with rollback.
 *
 * Order:
 * 1. Require file envelope + recovery bundle
 * 2. set Keychain + get round-trip
 * 3. Rewrite envelope wrap.source=keychain (keep wrapping-key file)
 * 4. Verify full decrypt via Keychain
 * 5. Archive + delete wrapping-key file
 */
export async function migrateFileEnvelopeToKeychain(identityDir: string): Promise<{
  keyId: string;
  service: string;
  account: string;
}> {
  const {
    resolveKeychainHelper,
    KEYCHAIN_SERVICE,
    AuthCancelledError,
    NonInteractiveKeychainError,
  } = await import('./keychainHelper.js');

  const helper = await resolveKeychainHelper();
  if (!helper) {
    throw new Error('macOS Keychain helper is not available. Install @dotenvup/keychain-darwin on macOS.');
  }
  await helper.probe();

  const envelope = await readIdentityEnvelope(identityDir);
  if (!envelope) {
    throw new Error('No identity.enc found. Run: up key upgrade');
  }
  if (envelope.wrap.source === 'keychain') {
    const account = envelope.wrap.account ?? envelope.keyId;
    if (await helper.has(account)) {
      return {
        keyId: envelope.keyId,
        service: envelope.wrap.service ?? KEYCHAIN_SERVICE,
        account,
      };
    }
  }
  if (envelope.wrap.source !== 'file' && envelope.wrap.source !== 'keychain') {
    throw new Error('Unsupported wrap.source for Keychain migration.');
  }

  const keyId = envelope.keyId;
  if (!(await recoveryBundleExists(identityDir, keyId))) {
    throw new Error('Recovery bundle required before Keychain migration. Run: up key upgrade');
  }

  const wrapPath = envelope.wrap.path ?? WRAPPING_KEY_FILE;
  const wrappingKey = await readFileWrappingKey(identityDir, wrapPath);
  const account = keyId;
  const service = KEYCHAIN_SERVICE;

  let pubRaw: string;
  try {
    pubRaw = await fs.readFile(path.join(identityDir, PUBLIC_IDENTITY_FILE), 'utf8');
  } catch {
    throw new Error('Missing identity.pub');
  }
  const publicKey = new Uint8Array(Buffer.from(pubRaw.trim(), 'base64'));
  if (publicKey.length !== 32) throw new Error('Invalid identity.pub');

  // Ensure we can decrypt with file key before touching Keychain.
  const privateKeyCheck = await unsealIdentity(envelope, wrappingKey, publicKey);

  try {
    await helper.set(account, wrappingKey);
  } catch (err) {
    if (err instanceof AuthCancelledError || err instanceof NonInteractiveKeychainError) throw err;
    throw err;
  }

  let fromKc: Uint8Array;
  try {
    fromKc = await helper.get(account);
  } catch (err) {
    try {
      await helper.delete(account);
    } catch {
      // ignore
    }
    throw err;
  }

  if (!keysEqual(fromKc, wrappingKey)) {
    try {
      await helper.delete(account);
    } catch {
      // ignore
    }
    throw new Error('Keychain round-trip verification failed. File envelope left unchanged.');
  }

  const newEnvelope = await sealIdentity(privateKeyCheck, publicKey, wrappingKey, {
    source: 'keychain',
    service,
    account,
  });
  // Preserve createdAt from original when possible
  newEnvelope.createdAt = envelope.createdAt;
  await writeIdentityEnvelope(identityDir, newEnvelope);

  // Verify decrypt via Keychain path (file fallback still allowed).
  const loaded = await loadKeypairEnvelope(identityDir);
  if (!loaded || !keysEqual(loaded.privateKey, privateKeyCheck)) {
    // Roll back envelope header to file source
    await writeIdentityEnvelope(identityDir, envelope);
    try {
      await helper.delete(account);
    } catch {
      // ignore
    }
    throw new Error('Post-migration decrypt verification failed. Rolled back to file envelope.');
  }

  // Archive wrapping-key then remove
  const archiveDir = path.join(identityDir, ARCHIVE_DIR, keyId);
  await fs.mkdir(archiveDir, { recursive: true, mode: 0o700 });
  const wrapFile = path.join(identityDir, wrapPath);
  try {
    await fs.copyFile(wrapFile, path.join(archiveDir, WRAPPING_KEY_FILE));
    await fs.unlink(wrapFile);
  } catch (err) {
    // Envelope is keychain-backed and verified; missing delete is non-fatal but warn via throw soft?
    throw new Error(
      `Keychain migration succeeded but failed to remove wrapping-key file: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return { keyId, service, account };
}

/**
 * Migrate plaintext identity → file envelope without losing the only copy.
 *
 * Order (fail-safe):
 * 1. Load + integrity-check plaintext keypair
 * 2. Write `identity.bak-<keyId>` (extra copy)
 * 3. Write envelope + wrapping-key while plaintext still present
 * 4. Verify envelope decrypts to the same keypair
 * 5. Only then unlink plaintext `identity`
 *
 * On verify failure: plaintext is left untouched; partial envelope files may exist
 * but the original key remains usable.
 */
export async function migratePlaintextToEnvelope(identityDir: string): Promise<{
  keyId: string;
  bakPath: string;
} | null> {
  const mode = await detectKeyStorageMode(identityDir);
  if (mode === 'file-envelope') return null;
  if (mode !== 'plaintext') return null;

  const plaintextPath = path.join(identityDir, PLAINTEXT_IDENTITY_FILE);
  const privRaw = await fs.readFile(plaintextPath, 'utf8');
  const pubRaw = await fs.readFile(path.join(identityDir, PUBLIC_IDENTITY_FILE), 'utf8');
  const privateKey = new Uint8Array(Buffer.from(privRaw.trim(), 'base64'));
  const publicKey = new Uint8Array(Buffer.from(pubRaw.trim(), 'base64'));
  if (privateKey.length !== 32 || publicKey.length !== 32) {
    throw new Error('Cannot migrate: plaintext identity is invalid.');
  }
  await assertKeypairConsistent(publicKey, privateKey);

  const keyId = await keyFingerprint(publicKey);
  const bakPath = path.join(identityDir, `identity.bak-${keyId}`);
  await writeAtomic(bakPath, privRaw.endsWith('\n') ? privRaw : privRaw + '\n', 0o600);

  // Keep plaintext until envelope round-trips successfully.
  await saveKeypairEnvelope(identityDir, publicKey, privateKey, { removePlaintext: false });

  const loaded = await loadKeypairEnvelope(identityDir);
  if (
    !loaded ||
    !keysEqual(loaded.privateKey, privateKey) ||
    !keysEqual(loaded.publicKey, publicKey)
  ) {
    throw new Error(
      'Cannot migrate: envelope verification failed. Plaintext identity was left unchanged.',
    );
  }

  await fs.unlink(plaintextPath);
  return { keyId, bakPath };
}

export function recoveryBundlePath(identityDir: string, keyId: string): string {
  return path.join(identityDir, RECOVERY_DIR, `${keyId}.dotenvup-key`);
}

export async function recoveryBundleExists(identityDir: string, keyId: string): Promise<boolean> {
  try {
    await fs.access(recoveryBundlePath(identityDir, keyId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Archive current identity materials under archive/<keyId>/ before overwrite.
 */
export async function archiveIdentity(identityDir: string, keyId: string): Promise<string> {
  const dest = path.join(identityDir, ARCHIVE_DIR, keyId);
  await fs.mkdir(dest, { recursive: true, mode: 0o700 });

  const names = [
    PLAINTEXT_IDENTITY_FILE,
    PUBLIC_IDENTITY_FILE,
    IDENTITY_ENVELOPE_FILE,
    WRAPPING_KEY_FILE,
  ];
  for (const name of names) {
    const src = path.join(identityDir, name);
    try {
      await fs.copyFile(src, path.join(dest, name));
    } catch {
      // optional
    }
  }

  const recoverySrc = recoveryBundlePath(identityDir, keyId);
  try {
    await fs.copyFile(recoverySrc, path.join(dest, `${keyId}.dotenvup-key`));
  } catch {
    // optional
  }

  return dest;
}
