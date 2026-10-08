import { useState } from 'react';
import { faviconFor } from '@/services/relay/relay-info';
import { useRelayInfo } from '@/hooks/relay/info/useRelayInfo';
import { useSuggestedRelayAdd } from '@/hooks/relay/rail/useSuggestedRelayAdd';
import { colorFor, letterFor } from '@/utils/relay-url/relay-tile-style';
import { shortHost } from '@/utils/relay-url/url-host';

/**
 * Suggested-relay data shared by the dialog and phone sheet: its NIP-11 name,
 * description and icon (the favicon when the document has none, a letter
 * until it arrives or when the image fails), and the add action.
 */
export function useSuggestedRelayItem(url: string, alreadyAdded: boolean, onAdded: () => void) {
  const { info, loaded } = useRelayInfo(url);
  const [iconFailed, setIconFailed] = useState(false);
  const { busy, error, add } = useSuggestedRelayAdd(url, alreadyAdded, onAdded);
  const host = shortHost(url);
  const iconUrl = loaded ? info?.icon || faviconFor(url) : null;
  return {
    host,
    name: info?.name || host,
    description: info?.description || '',
    /** The icon to show, or null for the letter tile. */
    icon: iconUrl && !iconFailed ? iconUrl : null,
    onIconError: () => setIconFailed(true),
    initials: letterFor(host),
    accent: colorFor(host),
    busy,
    error,
    add,
  };
}
