import type { FormSpec } from '@/constants/common/form';
import { filled } from '@/utils/common/form-rules';

export type VoiceJoinValues = { room: string };

/**
 * The `/voice` join form: a room name, `test` to start with. A blank name
 * does nothing; any other opens `/voice/<name>` through `open` (the page's
 * router).
 */
export function voiceJoinForm(open: (path: string) => void): FormSpec<VoiceJoinValues> {
  return {
    initial: { room: 'test' },
    ready: (values) => filled(values.room),
    submit: (values) => open(`/voice/${encodeURIComponent(values.room.trim())}`),
  };
}
