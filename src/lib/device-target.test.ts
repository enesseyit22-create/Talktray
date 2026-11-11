import { describe, expect, it } from 'vitest';

import { deviceTarget } from './device-target';

describe('deviceTarget', () => {
  it('sends reminders to Reminders on iOS and the calendar elsewhere', () => {
    expect(deviceTarget('reminder', 'ios')).toBe('reminders');
    expect(deviceTarget('reminder', 'android')).toBe('calendar');
    expect(deviceTarget('event', 'ios')).toBe('calendar');
    expect(deviceTarget('task', 'android')).toBe('calendar');
  });

  it('skips notes, shopping, and the web', () => {
    expect(deviceTarget('note', 'ios')).toBeNull();
    expect(deviceTarget('shopping', 'android')).toBeNull();
    expect(deviceTarget('task', 'web')).toBeNull();
  });
});
