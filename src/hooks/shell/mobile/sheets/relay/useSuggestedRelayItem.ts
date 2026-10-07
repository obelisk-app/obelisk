import { useState } from 'react';
import { faviconFor } from '@/services/relay/relay-info';
import { useRelayInfo } from '@/hooks/shell/rail/useRelayInfo';
import { useSuggestedRelayAdd } from '@/hooks/relay/useAddRelayForm';
import { shortHost } from '@/utils/relay-url/url-host';

/**
 * One suggested relay in the phone add-relay sheet: its NIP-11 name,
 * description and icon (the favicon when the document has none, a letter
 * until it arrives or when the image fails), and the add action.
 */
export function useSuggestedRelayItem(url: string, alreadyAdded: boolean, onAdded: () => void) {
  const { info, loaded } = useRelayInfo(url);
  const [iconFailed, setIconFailed] = useState(false);
  const { busy, error, add } = useSuggestedRelayAdd(url, alreadyAdded, onAdded);
  const iconUrl = loaded ? info?.icon || faviconFor(url) : null;
  return {
    host: shortHost(url),
    name: info?.name || shortHost(url),
    description: info?.description || '',
    /** The icon to show, or null for the letter tile. */
    icon: iconUrl && !iconFailed ? iconUrl : null,
    onIconError: () => setIconFailed(true),
    busy,
    error,
    add,
  };
}
