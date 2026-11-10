let pending = false;
const listeners = new Set<() => void>();

export function armAutoRecord() {
  pending = true;
  listeners.forEach((listener) => listener());
}

export function consumeAutoRecord() {
  const value = pending;
  pending = false;
  return value;
}

export function hasPendingRecord() {
  return pending;
}

export function onAutoRecord(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
