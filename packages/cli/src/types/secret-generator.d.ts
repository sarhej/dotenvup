declare module '@dotenvup/secret-generator' {
  export function generatePassphrase(options?: {
    wordCount?: number;
    separator?: string;
    wordlist?: string[];
  }): string;
}
