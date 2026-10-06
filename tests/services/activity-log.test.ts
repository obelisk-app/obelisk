import { describe, expect, it } from 'vitest';
import { getActivitySnapshot, trackActivity } from '@/services/activity-log';
import { CodedError } from '@/utils/errors/codes';

describe('trackActivity', () => {
  it('keeps a failed step\'s code as its detail, so the indicator can translate it', async () => {
    await expect(trackActivity('signBunker', () => Promise.reject(new CodedError('signer-timeout', 'signer timed out'))))
      .rejects.toThrow('signer timed out');
    const entry = getActivitySnapshot().find((e) => e.label === 'signBunker');
    expect(entry).toMatchObject({ status: 'error', detail: 'signer-timeout' });
  });

  it('keeps an uncoded failure\'s own words', async () => {
    await expect(trackActivity('signLocal', () => Promise.reject(new Error('bad key')))).rejects.toThrow('bad key');
    expect(getActivitySnapshot().find((e) => e.label === 'signLocal')).toMatchObject({ status: 'error', detail: 'bad key' });
  });
});
