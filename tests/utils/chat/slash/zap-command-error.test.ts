import { describe, expect, it } from 'vitest';
import { zapCommandErrorKey } from '@/utils/chat/slash/zap-command-error';
import { translator } from '@tests/support/intl';

describe('zapCommandErrorKey', () => {
  it('words every refusal, naming the person when there is one', () => {
    const t = translator('en');
    expect(t(zapCommandErrorKey('self'))).toBe('Cannot zap yourself.');
    expect(t(zapCommandErrorKey('unknown-user'), { name: 'nobody' })).toBe('Unknown user: nobody');
    expect(translator('es')(zapCommandErrorKey('ambiguous'), { name: 'Dum' })).toMatch(/“Dum”.*npub/);
  });
});
