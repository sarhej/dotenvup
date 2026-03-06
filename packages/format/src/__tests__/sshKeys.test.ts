import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseSshEd25519,
  ed25519PubToX25519,
  ed25519SecretToX25519,
  fetchGitHubX25519Keys,
  sealedShareEncrypt,
  sealedShareDecrypt,
} from '../index.js';

let sodium: typeof import('libsodium-wrappers').default | null = null;

async function getSodium() {
  if (!sodium) {
    const mod = await import('libsodium-wrappers');
    await mod.ready;
    sodium = mod.default;
  }
  return sodium;
}

function sshEd25519Line(publicKey: Uint8Array, comment = 'test@example.com'): string {
  const type = Buffer.from('ssh-ed25519', 'utf8');
  const blob = Buffer.concat([
    Buffer.from([0, 0, 0, type.length]),
    type,
    Buffer.from([0, 0, 0, publicKey.length]),
    Buffer.from(publicKey),
  ]);
  return `ssh-ed25519 ${blob.toString('base64')} ${comment}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sshKeys', () => {
  it('parses an OpenSSH ed25519 public key line', async () => {
    const s = await getSodium();
    const kp = s.crypto_sign_keypair();
    const line = sshEd25519Line(kp.publicKey);

    const parsed = parseSshEd25519(line);

    expect(Buffer.from(parsed)).toEqual(Buffer.from(kp.publicKey));
  });

  it('converts Ed25519 keys to X25519 and decrypts sealed shares', async () => {
    const s = await getSodium();
    const kp = s.crypto_sign_keypair();

    const x25519Pub = await ed25519PubToX25519(kp.publicKey);
    const x25519Secret = await ed25519SecretToX25519(kp.privateKey);

    const ciphertext = await sealedShareEncrypt('TOKEN=abc123', x25519Pub);
    const decrypted = await sealedShareDecrypt(ciphertext, x25519Pub, x25519Secret);

    expect(x25519Pub).toHaveLength(32);
    expect(x25519Secret).toHaveLength(32);
    expect(decrypted).toBe('TOKEN=abc123');
  });

  it('fetchGitHubX25519Keys filters to valid ssh-ed25519 keys', async () => {
    const s = await getSodium();
    const kp = s.crypto_sign_keypair();
    const valid = sshEd25519Line(kp.publicKey, 'octocat@github');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${valid}\nssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 fake\nssh-ed25519 invalid-base64`,
      }),
    );

    const results = await fetchGitHubX25519Keys('octocat');

    expect(results).toHaveLength(1);
    expect(results[0].sshKey).toBe(valid);
    expect(results[0].x25519Pub).toHaveLength(32);
  });
});
