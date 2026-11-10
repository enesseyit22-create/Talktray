import { afterEach, describe, expect, it } from 'vitest';

import { createId } from './id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createId', () => {
  const original = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
  });

  it('returns an RFC 4122 v4 UUID when randomUUID is missing', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: original.getRandomValues.bind(original),
      },
    });
    expect(typeof globalThis.crypto.randomUUID).toBe('undefined');
    expect(createId()).toMatch(UUID_V4);
  });

  it('returns an RFC 4122 v4 UUID from Math.random when crypto is missing', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    expect(createId()).toMatch(UUID_V4);
  });
});
