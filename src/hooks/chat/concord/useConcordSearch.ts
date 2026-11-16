import { useMemo, useState } from 'react';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

export function useConcordSearch(groups: JsGroup[], messages: JsMessage[]) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLocaleLowerCase();
  const channels = useMemo(() => groups.filter(group => (group.name ?? '').toLocaleLowerCase().includes(term)), [groups, term]);
  const hits = useMemo(() => term ? messages.filter(message => message.content.toLocaleLowerCase().includes(term)).slice(-50) : [], [messages, term]);
  return { query, setQuery, channels, hits };
}
