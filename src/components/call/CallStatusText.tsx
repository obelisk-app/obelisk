'use client';

import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/i18n/keys';
import CallTimer from './CallTimer';

/** Why the call ended, else the set-up line, else the running timer once connected. */
export default function CallStatusText({ ended, endedKey, lineKey, connectedAt }: {
  ended: boolean;
  endedKey: MessageKey;
  lineKey: MessageKey | null;
  connectedAt: number | null;
}) {
  const t = useTranslations();
  if (ended) return <>{t(endedKey)}</>;
  if (lineKey) return <>{t(lineKey)}</>;
  return connectedAt ? <CallTimer since={connectedAt} /> : null;
}
