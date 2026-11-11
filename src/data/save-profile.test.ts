import { describe, expect, it } from 'vitest';

import { ProfileNotSavedError, savedFromRow } from './save-profile';

describe('saved profile row', () => {
  it('reads the stored display name and username', () => {
    expect(savedFromRow({ id: 'user-1', display_name: 'Ada', username: 'ada' })).toEqual({
      displayName: 'Ada',
      username: 'ada',
    });
    expect(savedFromRow([{ id: 'user-1', display_name: '', username: null }])).toEqual({
      displayName: '',
      username: null,
    });
  });

  it('treats an empty update result as a failed save', () => {
    expect(() => savedFromRow(null)).toThrow(ProfileNotSavedError);
    expect(() => savedFromRow([])).toThrow(ProfileNotSavedError);
    expect(() => savedFromRow({ display_name: 'Ada' })).toThrow(ProfileNotSavedError);
  });
});
