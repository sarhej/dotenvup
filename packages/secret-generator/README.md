# @dotenvup/secret-generator

Canonical source: **[github.com/sarhej/dotenvup](https://github.com/sarhej/dotenvup/tree/main/packages/secret-generator)** (MIT DotEnvUp monorepo).

MIT-licensed client-side helpers for generating passwords and passphrases using **Web Crypto** (`crypto.getRandomValues`) with rejection sampling (no modulo bias).

Passphrases use the [EFF Large Wordlist](https://www.eff.org/dice) (CC0).

## API

- `randomBytes(n)` — `Uint8Array` of length `n`
- `randomUniformInt(maxExclusive)` — uniform integer in `[0, maxExclusive)`
- `generatePassword(options)` — random string
- `generatePassphrase(options)` — EFF-style passphrase
- `estimatePasswordEntropyBits(length, charsetSize)`
- `estimatePassphraseEntropyBits(wordCount, wordlistSize?)`
- `DEFAULT_SYMBOLS`, `EFF_LARGE_WORDLIST_SIZE`

## Build

```bash
npm run build
```

Produces `dist/index.js` (single ESM bundle) for vendoring into static sites.

## License

MIT. The bundled wordlist is from EFF (CC0); see [EFF wordlist page](https://www.eff.org/dice).
