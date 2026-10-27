import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { copyWithToast } from '@/services/common/clipboard';
import { npubOrNull, shortNpubLabel } from '@/utils/identity/short-npub';
import { shortHost } from '@/utils/relay-url/url-host';

/**
 * The "this relay refused you" help's view model: the relay's host, the
 * signed-in npub to hand its operator (shown short, copied whole), and the
 * copy action, with the same toast as every other copy-npub.
 */
export function useRelayAccessHelp() {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const pubkey = useMyPubkey();
  const npub = pubkey ? npubOrNull(pubkey) : null;
  const npubShort = pubkey ? shortNpubLabel(pubkey) : '';
  return {
    host: relay ? shortHost(relay) : '',
    npub,
    npubShort,
    copyNpub: () => {
      if (npub) copyWithToast(npub, t('social.profileFeed.npubCopied'), npubShort);
    },
  };
}
