'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { faviconFor } from '@/services/relay/relay-info';
import { useSuggestedRelayAdd } from '@/hooks/relay/rail/useSuggestedRelayAdd';
import { useRelayInfo } from '@/hooks/relay/info/useRelayInfo';
import { shortHost } from '@/utils/relay-url/url-host';
import { colorFor, letterFor } from '@/utils/relay-url/relay-tile-style';

/**
 * One suggested relay: its NIP-11 name, description and icon (the favicon
 * guess, then the host letters on an accent once an icon fails), and adding
 * it to the rail.
 */
export function useSuggestedRelayItem(url: string, alreadyAdded: boolean, onAdded: () => void) {
  const t = useTranslations();
  const { info } = useRelayInfo(url);
  const [iconFailed, setIconFailed] = useState(false);
  const { busy, error, add } = useSuggestedRelayAdd(url, alreadyAdded, onAdded);
  const host = shortHost(url);
  const icon = info?.icon || faviconFor(url);
  return {
    name: info?.name || host,
    description: info?.description || t('shell.rail.addModal.noDescription'),
    /** The icon to draw, or `null` for the letters. */
    icon: icon && !iconFailed ? icon : null,
    onIconError: () => setIconFailed(true),
    initials: letterFor(host),
    accent: colorFor(host),
    busy,
    error,
    add: () => void add(),
    buttonLabel: alreadyAdded
      ? t('shell.rail.addModal.added')
      : busy ? t('shell.rail.addModal.adding') : t('shell.rail.addModal.add'),
  };
}
