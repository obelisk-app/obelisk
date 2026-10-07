import { describe, expect, it } from 'vitest';
import { voiceErrorMessage, voiceErrorText } from '@/utils/voice/error-text';
import { VoiceError } from '@/utils/voice/errors';
import { translator } from '@tests/support/intl';

describe('voiceErrorText', () => {
  it('translates a code and leaves any other text as it is', () => {
    expect(voiceErrorText(translator('es'), 'roomFull')).toBe('La sala está llena. Probá de nuevo cuando alguien salga.');
    expect(voiceErrorText(translator('pt'), 'notMember')).toBe('Você não é membro deste canal de voz.');
    expect(voiceErrorText(translator('en'), 'something odd')).toBe('something odd');
    expect(voiceErrorText(translator('en'), null)).toBeNull();
  });
});

describe('voiceErrorMessage', () => {
  it('shows a VoiceError by its code and anything else as the fallback', () => {
    const t = translator('en');
    expect(voiceErrorMessage(t, new VoiceError('sfuNotObelisk', 'URL is not an Obelisk SFU'), 'sfuInfoHttp'))
      .toBe('That URL is not an Obelisk SFU.');
    expect(voiceErrorMessage(t, new TypeError('Failed to fetch'), 'sfuInfoHttp'))
      .toBe('The SFU did not answer its /info check.');
  });
});
