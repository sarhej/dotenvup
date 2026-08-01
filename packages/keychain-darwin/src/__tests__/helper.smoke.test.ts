import { describe, it, expect } from 'vitest';
import { createHelper, isDarwin, resolveHelperPath } from '../index.js';
import { randomBytes } from 'node:crypto';

const runNative = process.platform === 'darwin' && process.env.DOTENVUP_KEYCHAIN_SMOKE === '1';

describe('keychain-darwin helper', () => {
  it('resolveHelperPath finds built binary on darwin after build', () => {
    if (!isDarwin()) {
      expect(resolveHelperPath()).toBeNull();
      return;
    }
    // Binary may be absent in fresh checkout; skip soft
    const p = resolveHelperPath();
    if (!p) {
      expect(p).toBeNull();
      return;
    }
    expect(p).toContain('dotenvup-keychain');
  });

  it('probe succeeds when binary present', async () => {
    if (!isDarwin()) return;
    const helper = createHelper();
    if (!helper) return;
    const probe = await helper.probe();
    expect(probe.version).toBeTruthy();
    expect(probe.service).toBe('com.dotenvup.wrapping-key');
  });

  it.skipIf(!runNative)('set/has/get/delete round-trip (interactive Touch ID)', async () => {
    const helper = createHelper();
    expect(helper).not.toBeNull();
    const account = `dotenvup-test-${randomBytes(4).toString('hex')}`;
    const key = new Uint8Array(randomBytes(32));
    await helper!.set(account, key);
    expect(await helper!.has(account)).toBe(true);
    const got = await helper!.get(account);
    expect(Buffer.from(got).equals(Buffer.from(key))).toBe(true);
    await helper!.delete(account);
    expect(await helper!.has(account)).toBe(false);
  });
});
