import { describe, expect, it } from 'vitest';

import { memberLabel, premiumBody, premiumDeliveryId, premiumWord, signupBody, signupDeliveryId } from './admin-push';
import * as edgeCopy from '../supabase/functions/_shared/admin-push';

describe('admin push copy', () => {
  it('names a new member by username or email', () => {
    expect(signupBody(memberLabel('ayse', 'ayse@example.com'))).toBe('Yeni üye: ayse');
    expect(signupBody(memberLabel(null, 'ayse@example.com', 'Ayşe'))).toBe('Yeni üye: ayse@example.com');
    expect(signupDeliveryId('user-1')).toBe('signup:user-1');
  });

  it('labels store plans and gifts, and dedupes store against itself', () => {
    expect(premiumWord('store', 'talktray_pro_monthly')).toBe('aylık');
    expect(premiumWord('store', 'talktray_pro:annual')).toBe('yıllık');
    expect(premiumWord('store', 'P1Y')).toBe('yıllık');
    expect(premiumWord('gift', 'year')).toBe('hediye');
    expect(premiumWord('gift', 'lifetime')).toBe('hediye');
    expect(premiumBody('ayse', 'aylık')).toBe('Yeni Premium: ayse (aylık)');
    expect(premiumBody('ayse@example.com', 'hediye')).toBe('Yeni Premium: ayse@example.com (hediye)');

    const fromStore = premiumDeliveryId({ source: 'store', userId: 'u1', word: 'aylık' });
    const fromApp = premiumDeliveryId({ source: 'store', userId: 'u1', word: 'aylık' });
    expect(fromStore).toBe(fromApp);
    expect(premiumDeliveryId({ source: 'store', userId: 'u1', word: 'yıllık' })).not.toBe(fromStore);
    expect(premiumDeliveryId({ source: 'gift', userId: 'u1', word: 'hediye', until: 'infinity' })).toBe(
      'premium:gift:u1:infinity',
    );
    expect(edgeCopy.signupBody('ayse')).toBe(signupBody('ayse'));
    expect(edgeCopy.premiumBody('ayse', 'yıllık')).toBe(premiumBody('ayse', 'yıllık'));
    expect(edgeCopy.premiumDeliveryId({ source: 'store', userId: 'u1', word: 'aylık' })).toBe(fromStore);
  });
});
