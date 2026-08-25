# @dotenvup/node

Drop-in replacement for [`dotenv`](https://www.npmjs.com/package/dotenv) that reads encrypted `.env.up` files.

## Usage

```js
// Before (plaintext .env)
require('dotenv').config();

// After (encrypted .env.up)
import { config } from '@dotenvup/node';
config();
```

Your code keeps using `process.env.DB_HOST` as usual. Values are decrypted in memory — no plaintext written to disk.

## Installation

```bash
npm install @dotenvup/node
```

Requires `@dotenvup/format` **0.3.0+** (optional `[policy]` / merge re-encrypt). See the [User Guide](https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md).
