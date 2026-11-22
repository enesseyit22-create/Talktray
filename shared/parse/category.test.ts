import { describe, expect, it } from 'vitest';

import { inferCategory } from './category';

describe('categories', () => {
  it('keeps shopping on the shopping list and reads obvious words', () => {
    expect(inferCategory({ type: 'shopping', title: 'Kalem' })).toBe('shopping');
    expect(inferCategory({ type: 'task', title: 'Süt ve ekmek al' })).toBe('shopping');
    expect(inferCategory({ type: 'event', title: 'Pazartesi toplantı' })).toBe('work');
    expect(inferCategory({ type: 'reminder', title: 'İlacı iç' })).toBe('health');
    expect(inferCategory({ type: 'task', title: 'Fatura öde' })).toBe('home');
    expect(inferCategory({ type: 'note', title: 'Spor salonu' })).toBe('personal');
    expect(inferCategory({ type: 'note', title: 'Rastgele fikir' })).toBe('other');
  });
});
