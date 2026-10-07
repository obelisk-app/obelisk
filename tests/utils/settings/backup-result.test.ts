import { describe, expect, it } from 'vitest';
import { failedBackupMedia } from '@/utils/settings/backup-result';

describe('failedBackupMedia', () => {
  it('counts the media entries that carry an error', () => {
    expect(failedBackupMedia({ media: [] })).toBe(0);
    expect(failedBackupMedia({ media: [{}, { error: 'timeout' }, { error: '' }, { error: '404' }] })).toBe(2);
  });
});
