import { describe, expect, it } from 'vitest';

import { classifyStoreError, scrubBillingText } from '@/services/purchase-errors';

describe('purchase errors', () => {
  it('maps store codes to a user-facing reason', () => {
    expect(classifyStoreError('1', 'PURCHASE_CANCELLED_ERROR')).toBe('cancelled');
    expect(classifyStoreError('10')).toBe('network');
    expect(classifyStoreError('5')).toBe('plans_missing');
    expect(classifyStoreError('6')).toBe('already_owned');
    expect(classifyStoreError('20')).toBe('pending');
    expect(classifyStoreError('3')).toBe('not_allowed');
    expect(classifyStoreError('23', 'CONFIGURATION_ERROR')).toBe('not_configured');
    expect(classifyStoreError('2')).toBe('store');
  });

  it('strips sdk keys from logs', () => {
    const text = scrubBillingText('invalid appl_RgzWQMZehRfiafWyReOAOBMlTgD and goog_PBSMDAoJJABsIyxqmhhcXSCorNT Bearer secret-token');
    expect(text).not.toContain('RgzW');
    expect(text).not.toContain('PBSM');
    expect(text).not.toContain('secret-token');
    expect(text).toContain('appl_[redacted]');
  });
});
