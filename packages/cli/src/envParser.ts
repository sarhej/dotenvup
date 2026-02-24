/**
 * Re-export from @dotenvup/format for CLI consumers.
 * Parser and comparison logic live in format so CLI and extension share the same implementation.
 */
export { parseEnvFile, entriesMatch, entriesDiff } from '@dotenvup/format';
