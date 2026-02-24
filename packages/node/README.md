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

## Status

Early development. Not yet functional. See [PRODUCT_VISION.md](../../docs/PRODUCT_VISION.md).
