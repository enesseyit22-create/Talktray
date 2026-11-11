export type DeviceTarget = 'calendar' | 'reminders';

/** Where a dated task, event, or reminder should land. Web has no device calendar. */
export function deviceTarget(type: string, platform: string): DeviceTarget | null {
  if (type !== 'task' && type !== 'reminder' && type !== 'event') return null;
  if (platform === 'web') return null;
  if (type === 'reminder' && platform === 'ios') return 'reminders';
  return 'calendar';
}
