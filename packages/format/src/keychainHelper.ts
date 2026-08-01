/**
 * Optional bridge to @dotenvup/keychain.
 * Missing package / non-darwin → null (file envelope remains usable).
 */

export const KEYCHAIN_SERVICE = 'com.dotenvup.wrapping-key';

export class AuthCancelledError extends Error {
  readonly code = 'AUTH_CANCELLED';
  constructor(message = 'Authentication cancelled') {
    super(message);
    this.name = 'AuthCancelledError';
  }
}

export class NonInteractiveKeychainError extends Error {
  readonly code = 'NON_INTERACTIVE_KEYCHAIN';
  constructor(
    message = "DotEnvUp session is locked. Ask the user to run a command interactively (Touch ID) to start a session, or set UP_KEY.",
  ) {
    super(message);
    this.name = 'NonInteractiveKeychainError';
  }
}

/** True when agents/CI must not show a biometric prompt. */
export function keychainPromptsBlocked(): boolean {
  return promptsBlocked();
}

export interface KeychainHelperApi {
  probe(): Promise<{
    version: string;
    service: string;
    biometryAvailable: boolean;
    ownerAuthAvailable: boolean;
    biometryType: string;
  }>;
  set(account: string, wrappingKey: Uint8Array): Promise<void>;
  get(account: string): Promise<Uint8Array>;
  has(account: string): Promise<boolean>;
  delete(account: string): Promise<void>;
}

let testOverride: KeychainHelperApi | null | undefined;

/** Test-only: inject a mock helper (`null` forces unavailable). */
export function setKeychainHelperForTests(helper: KeychainHelperApi | null | undefined): void {
  testOverride = helper;
}

/** VS Code / Cursor extension host has no TTY but can show LocalAuthentication UI. */
function isGuiExtensionHost(): boolean {
  if (process.env.DOTENVUP_ALLOW_PROMPT === '1') return true;
  if (process.env.VSCODE_PID || process.env.VSCODE_CWD) return true;
  // Cursor / Electron extension host
  if (process.env.CURSOR_EXTENSION_HOST === '1') return true;
  if (typeof process.versions === 'object' && process.versions && 'electron' in process.versions) {
    // Electron without an interactive TTY is still a GUI process.
    return true;
  }
  return false;
}

function promptsBlocked(): boolean {
  // Test doubles inject helpers; do not apply TTY/CI gates in that mode.
  if (testOverride !== undefined) {
    return process.env.DOTENVUP_NO_PROMPT === '1';
  }
  if (process.env.DOTENVUP_NO_PROMPT === '1') return true;
  if (process.env.CI === 'true' || process.env.CI === '1') return true;
  // Extension host: allow Touch ID / password prompts even when stdin is not a TTY.
  if (isGuiExtensionHost()) return false;
  if (!process.stdin.isTTY) return true;
  return false;
}

export async function resolveKeychainHelper(): Promise<KeychainHelperApi | null> {
  if (testOverride !== undefined) return testOverride;
  if (process.platform !== 'darwin') return null;
  try {
    const mod = (await import('@dotenvup/keychain')) as {
      createHelper?: () => KeychainHelperApi | null;
      AuthCancelledError?: new (message?: string) => Error;
    };
    const helper = mod.createHelper?.() ?? null;
    return helper;
  } catch {
    return null;
  }
}

export async function keychainHelperAvailable(): Promise<boolean> {
  const helper = await resolveKeychainHelper();
  if (!helper) return false;
  try {
    await helper.probe();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch wrapping key from Keychain. Honors DOTENVUP_NO_PROMPT / CI / non-TTY.
 */
export async function getWrappingKeyFromKeychain(account: string): Promise<Uint8Array> {
  const helper = await resolveKeychainHelper();
  if (!helper) {
    throw new Error('macOS Keychain helper is not available.');
  }
  if (promptsBlocked()) {
    throw new NonInteractiveKeychainError();
  }
  try {
    return await helper.get(account);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'AUTH_CANCELLED') {
      throw new AuthCancelledError(err instanceof Error ? err.message : 'Authentication cancelled');
    }
    if (err instanceof Error && err.name === 'AuthCancelledError') {
      throw new AuthCancelledError(err.message);
    }
    if (err instanceof Error && /Authentication cancelled/i.test(err.message)) {
      throw new AuthCancelledError(err.message);
    }
    throw err;
  }
}
