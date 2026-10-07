/**
 * The copy of the delete-message confirmations, read once from the translator.
 */
import type { Translate } from '@/i18n/keys';

export interface ModerationLabels {
  readonly confirmDeleteEveryone: string;
  readonly confirmDeleteEveryoneBody: string;
  readonly confirmDeleteOwn: string;
  readonly confirmDeleteOwnBody: string;
  readonly confirmLabel: string;
}

/** The confirm copy both shells already use for message deletion. */
export function moderationLabelsFrom(t: Translate): ModerationLabels {
  return {
    confirmDeleteEveryone: t('shell.desktop.message.confirmDeleteEveryone'),
    confirmDeleteEveryoneBody: t('shell.desktop.message.confirmDeleteEveryoneBody'),
    confirmDeleteOwn: t('shell.desktop.message.confirmDeleteOwn'),
    confirmDeleteOwnBody: t('shell.desktop.message.confirmDeleteOwnBody'),
    confirmLabel: t('common.confirm.delete'),
  };
}
