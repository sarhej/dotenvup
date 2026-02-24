import { describe, it, expect } from 'vitest';
import { scrubMessage, scrubSecret } from '../logger.js';

describe('logger', () => {
  describe('scrubSecret', () => {
    it('redacts secret keys', () => {
      expect(scrubSecret('DATABASE_PASSWORD')).toBe('[redacted]');
      expect(scrubSecret('STRIPE_SECRET_KEY')).toBe('[redacted]');
      expect(scrubSecret('AUTH_TOKEN')).toBe('[redacted]');
    });

    it('preserves non-secret keys', () => {
      expect(scrubSecret('APP_NAME')).toBe('APP_NAME');
      expect(scrubSecret('PORT')).toBe('PORT');
    });
  });

  describe('scrubMessage', () => {
    it('redacts secrets within a message string', () => {
      const msg = 'Failed to load DATABASE_PASSWORD from .env';
      expect(scrubMessage(msg)).toBe('Failed to load [redacted] from .env');
    });

    it('redacts multiple secrets', () => {
      const msg = 'Keys: API_KEY, DB_PASSWORD, APP_ID';
      expect(scrubMessage(msg)).toBe('Keys: [redacted], [redacted], APP_ID');
    });

    it('preserves non-secrets in message', () => {
      const msg = 'Loaded 5 keys for APP_ENV=production';
      expect(scrubMessage(msg)).toBe('Loaded 5 keys for APP_ENV=production');
    });
  });
});
