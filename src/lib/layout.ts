/** Vertical space a bottom sheet may occupy without crossing the screen edges. */
export function sheetFrame(input: {
  windowHeight: number;
  screenHeight: number;
  topInset: number;
  bottomInset: number;
  keyboard: number;
}): { maxHeight: number; marginBottom: number } {
  const windowHeight = Math.max(0, input.windowHeight);
  const screenHeight = Math.max(windowHeight, input.screenHeight);
  const topInset = clampInset(input.topInset, windowHeight);
  const bottomInset = clampInset(input.bottomInset, windowHeight);
  const keyboard = Math.max(0, input.keyboard);
  // Android can shrink the window and also report a keyboard height. Subtracting both
  // pushes the sheet off the top, so a clearly shrunk window keeps only the safe-area gap.
  const shrunk = windowHeight < screenHeight * 0.85;
  const marginBottom = !shrunk && keyboard > 0 ? keyboard : Math.max(bottomInset, 12);
  const available = windowHeight - topInset - marginBottom - 8;
  return {
    marginBottom,
    maxHeight: Math.max(0, available),
  };
}

/** Tab bar block height, including two lines of scaled label text. */
export function tabBarBlockHeight(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const line = Math.round(11 * 1.35 * scale);
  return Math.max(72, 8 + 22 + 4 + line * 2);
}

/** Scroll padding that clears the floating tab bar and the mic that rises above it. */
export function contentClearance(bottomInset: number, fontScale: number): number {
  return Math.max(bottomInset, 10) + tabBarBlockHeight(fontScale) + 28 + 40;
}

function clampInset(value: number, frame: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, frame);
}
