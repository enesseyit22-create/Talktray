import { describe, expect, it } from 'vitest';

import { contentClearance, sheetFrame, sheetTopInset, tabBarBlockHeight } from './layout';

describe('sheetFrame', () => {
  it('keeps a short phone sheet inside the screen, above the home indicator', () => {
    const frame = sheetFrame({
      windowHeight: 667,
      screenHeight: 667,
      topInset: 20,
      bottomInset: 0,
      keyboard: 0,
    });
    expect(frame.marginBottom).toBe(12);
    expect(frame.maxHeight).toBe(667 - 20 - 12 - 8);
    expect(frame.maxHeight + frame.marginBottom + 20).toBeLessThanOrEqual(667);
  });

  it('lifts the sheet above the keyboard without adding the safe area twice', () => {
    const frame = sheetFrame({
      windowHeight: 844,
      screenHeight: 844,
      topInset: 59,
      bottomInset: 34,
      keyboard: 336,
    });
    expect(frame.marginBottom).toBe(336);
    expect(frame.maxHeight).toBe(844 - 59 - 336 - 8);
    expect(frame.maxHeight + frame.marginBottom).toBeLessThanOrEqual(844 - 59);
  });

  it('does not subtract the keyboard again when the window already shrank', () => {
    const frame = sheetFrame({
      windowHeight: 520,
      screenHeight: 800,
      topInset: 24,
      bottomInset: 48,
      keyboard: 280,
    });
    expect(frame.marginBottom).toBe(48);
    expect(frame.maxHeight).toBe(520 - 24 - 48 - 8);
    expect(frame.maxHeight + frame.marginBottom + 24).toBeLessThanOrEqual(520);
  });

  it('keeps a 360x800 Android sheet under the status bar, keyboard closed or open', () => {
    expect(sheetTopInset(0, 0, 'android')).toBe(24);
    expect(sheetTopInset(0, 48, 'android')).toBe(48);
    const closed = sheetFrame({
      windowHeight: 800,
      screenHeight: 800,
      topInset: sheetTopInset(0, 48, 'android'),
      bottomInset: 48,
      keyboard: 0,
    });
    expect(closed.maxHeight + closed.marginBottom + 48).toBeLessThanOrEqual(800);
    expect(closed.maxHeight).toBe(800 - 48 - 48 - 8);
    const open = sheetFrame({
      windowHeight: 800,
      screenHeight: 800,
      topInset: 48,
      bottomInset: 48,
      keyboard: 320,
    });
    expect(open.marginBottom).toBe(320);
    expect(open.maxHeight).toBe(800 - 48 - 320 - 8);
    expect(open.maxHeight + open.marginBottom + 48).toBeLessThanOrEqual(800);
  });

  it('never returns a max height that crosses the top inset', () => {
    const frame = sheetFrame({
      windowHeight: 480,
      screenHeight: 480,
      topInset: 40,
      bottomInset: 34,
      keyboard: 0,
    });
    expect(frame.maxHeight).toBeGreaterThan(0);
    expect(frame.marginBottom + frame.maxHeight + 40 + 8).toBe(480);
  });
});

describe('tab bar clearance', () => {
  it('matches the resting bar at the default font scale', () => {
    expect(tabBarBlockHeight(1)).toBe(72);
    expect(contentClearance(34, 1)).toBe(34 + 72 + 28 + 40);
  });

  it('grows the bar when labels need a second scaled line', () => {
    expect(tabBarBlockHeight(2)).toBeGreaterThan(72);
    expect(contentClearance(0, 2)).toBeGreaterThan(contentClearance(0, 1));
  });
});
