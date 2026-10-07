import { afterEach, describe, expect, it, vi } from 'vitest';
import { promptForContact } from '@/services/chat/composer/contact-prompt';

describe('promptForContact', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the trimmed answer, or null when blank or cancelled', () => {
    const prompt = vi.fn(() => '  npub1abc  ');
    vi.stubGlobal('prompt', prompt);
    expect(promptForContact('Which key?')).toBe('npub1abc');
    expect(prompt).toHaveBeenCalledWith('Which key?');
    vi.stubGlobal('prompt', vi.fn(() => '   '));
    expect(promptForContact('Which key?')).toBeNull();
    vi.stubGlobal('prompt', vi.fn(() => null));
    expect(promptForContact('Which key?')).toBeNull();
  });
});
