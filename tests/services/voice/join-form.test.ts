import { describe, expect, it, vi } from 'vitest';
import { voiceJoinForm } from '@/services/voice/join-form';

describe('voiceJoinForm', () => {
  it('starts on the "test" room', () => {
    expect(voiceJoinForm(vi.fn()).initial).toEqual({ room: 'test' });
  });

  it('opens the trimmed, encoded room and refuses a blank name', () => {
    const open = vi.fn();
    const spec = voiceJoinForm(open);
    expect(spec.ready!({ room: '   ' })).toBe(false);
    expect(spec.ready!({ room: 'a' })).toBe(true);
    void spec.submit({ room: '  my room ' });
    expect(open).toHaveBeenCalledWith('/voice/my%20room');
  });
});
