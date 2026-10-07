'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useGroups, type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { forwardTargets } from '@/utils/chat/message/forward';
import { forwardMessage } from '@/services/chat/message/forward-message';

/**
 * The forward dialog's view model: the channel search, the channels a
 * message can go to, and the forward itself (one at a time; the dialog
 * closes when it went out, and the rows unlock again when it failed).
 */
export function useForwardMessageModal(message: JsMessage, authorName: string, fromGroupId: string, onClose: () => void) {
  const t = useTranslations();
  const groups = useGroups();
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const fromChannel = groups.find((g) => g.id === fromGroupId)?.name ?? null;
  const targets = useMemo(() => forwardTargets(groups, fromGroupId, query), [groups, query, fromGroupId]);

  return {
    query,
    setQuery,
    targets,
    sending,
    forward: async (target: JsGroup) => {
      setSending(target.id);
      if (await forwardMessage(target, message, { authorName, fromChannel }, t)) onClose();
      else setSending(null);
    },
  };
}
