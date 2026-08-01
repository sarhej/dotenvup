declare module '@dotenvup/keychain-darwin' {
  export function createHelper(binaryPath?: string): {
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
  } | null;
  export class AuthCancelledError extends Error {
    readonly code: string;
  }
}
