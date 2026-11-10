import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const listeners = new Set<(now: Date) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

function tick() {
  const now = new Date();
  for (const listener of listeners) listener(now);
}

function startClock() {
  if (timer) return;
  timer = setInterval(tick, 60_000);
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') tick();
  });
}

function stopClock() {
  if (timer) clearInterval(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
}

/** Current time, refreshed every minute and whenever the app returns to the foreground. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    listeners.add(setNow);
    startClock();
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0) stopClock();
    };
  }, []);
  return now;
}
