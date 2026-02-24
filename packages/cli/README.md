# @dotenvup/cli

CLI tool for managing `.env.up` encrypted environment files.

## Usage

```bash
# Install globally
npm install -g @dotenvup/cli

# Or use with npx
npx @dotenvup/cli

# Commands
up init                  # Initialize .env.up in current project
up import .env           # Convert plaintext .env to encrypted .env.up
up lock                  # Lock — securely delete plaintext .env
up unlock 5m             # Unlock — generate .env for 5 minutes
up show                  # Show all decrypted values
up show DB_HOST          # Show one decrypted value
up run -- npm start      # Run command with decrypted env vars (no disk write)
up keys                  # List keys with metadata (no decryption needed)
up status                # Lock status + key freshness report
```

## Status

Early development. Not yet functional. See [PRODUCT_VISION.md](../../docs/PRODUCT_VISION.md).
