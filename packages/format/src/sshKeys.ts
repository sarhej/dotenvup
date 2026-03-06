/**
 * @dotenvup/format — SSH Key Utilities
 *
 * Parse OpenSSH Ed25519 public keys and convert between Ed25519 signing keys
 * and X25519 encryption keys using libsodium's built-in conversion functions.
 *
 * Used for Approach B (true recipient encryption): encrypt to a GitHub user's
 * SSH Ed25519 public key, recipient decrypts with their private key.
 */

let sodium: any = null;

async function getSodium() {
  if (!sodium) {
    const lib = await import('libsodium-wrappers');
    await lib.ready;
    sodium = lib.default;
  }
  return sodium!;
}

/**
 * Parse an OpenSSH Ed25519 public key line into a 32-byte Ed25519 public key.
 *
 * Input format: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... comment"
 * The base64 body is a wire format: [uint32 len]["ssh-ed25519"][uint32 len][32-byte key]
 */
export function parseSshEd25519(sshKeyLine: string): Uint8Array {
  const parts = sshKeyLine.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] !== 'ssh-ed25519') {
    throw new Error('Not an ssh-ed25519 key');
  }

  const raw = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  let offset = 0;

  function readU32(): number {
    const v = (raw[offset] << 24) | (raw[offset + 1] << 16) | (raw[offset + 2] << 8) | raw[offset + 3];
    offset += 4;
    return v >>> 0;
  }

  function readBytes(n: number): Uint8Array {
    const slice = raw.slice(offset, offset + n);
    offset += n;
    return slice;
  }

  const typeLen = readU32();
  const typeStr = new TextDecoder().decode(readBytes(typeLen));
  if (typeStr !== 'ssh-ed25519') {
    throw new Error(`Expected ssh-ed25519 type field, got "${typeStr}"`);
  }

  const keyLen = readU32();
  if (keyLen !== 32) {
    throw new Error(`Expected 32-byte Ed25519 key, got ${keyLen} bytes`);
  }
  return readBytes(32);
}

/**
 * Convert a 32-byte Ed25519 public key to a 32-byte X25519 public key.
 * Uses libsodium's crypto_sign_ed25519_pk_to_curve25519.
 */
export async function ed25519PubToX25519(ed25519Pub: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_sign_ed25519_pk_to_curve25519(ed25519Pub);
}

/**
 * Convert a 64-byte Ed25519 secret key to a 32-byte X25519 secret key.
 * Uses libsodium's crypto_sign_ed25519_sk_to_curve25519.
 *
 * Note: OpenSSH Ed25519 private keys are 64 bytes (seed || public key).
 * If only the 32-byte seed is available, expand it first with
 * crypto_sign_seed_keypair then use the resulting secret key.
 */
export async function ed25519SecretToX25519(ed25519Secret: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_sign_ed25519_sk_to_curve25519(ed25519Secret);
}

/**
 * Fetch SSH public keys from GitHub for a given username.
 * Returns raw lines from https://github.com/{username}.keys
 * (plain text, one key per line).
 */
export async function fetchGitHubSshKeys(username: string): Promise<string[]> {
  const res = await fetch(`https://github.com/${encodeURIComponent(username)}.keys`);
  if (!res.ok) return [];
  const text = await res.text();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Fetch and parse Ed25519 SSH keys from GitHub, returning X25519 public keys.
 * Filters to only ssh-ed25519 keys and converts them.
 */
export async function fetchGitHubX25519Keys(
  username: string,
): Promise<{ sshKey: string; x25519Pub: Uint8Array }[]> {
  const lines = await fetchGitHubSshKeys(username);
  const ed25519Lines = lines.filter((l) => l.startsWith('ssh-ed25519 '));
  const results: { sshKey: string; x25519Pub: Uint8Array }[] = [];

  for (const line of ed25519Lines) {
    try {
      const ed25519Pub = parseSshEd25519(line);
      const x25519Pub = await ed25519PubToX25519(ed25519Pub);
      results.push({ sshKey: line, x25519Pub });
    } catch {
      // skip keys that fail to parse
    }
  }

  return results;
}
