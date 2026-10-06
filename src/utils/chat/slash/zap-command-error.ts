import type { MessageKey } from '@/i18n/keys';
import type { ZapCommandError } from '@/services/wallet/parse-zap-command';

const KEYS = {
  invalid: 'chat.zapCommand.invalid',
  ambiguous: 'chat.zapCommand.ambiguous',
  'unknown-user': 'chat.zapCommand.unknownUser',
  'no-target': 'chat.zapCommand.noTarget',
  self: 'chat.zapCommand.self',
} as const satisfies Record<ZapCommandError, MessageKey>;

/** The message for a refused `/zap`; `ambiguous` and `unknown-user` take the typed name as `{name}`. */
export function zapCommandErrorKey(error: ZapCommandError): MessageKey {
  return KEYS[error];
}
