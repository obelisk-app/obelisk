import List from '@/components/ui/layout/List';
import Link from '@/components/ui/navigation/Link';
/**
 * "Open in" - the other Nostr clients that can display this event.
 *
 * This belongs on the viewer page, not in the ⋯ menu of every note card.
 * Inside the app the reader is already in a client and the menu is for
 * acting on a note; here they've arrived from a shared link and may well
 * prefer their own client, which is exactly the moment the offer is useful.
 *
 * `nostr:` comes first: on a device with a registered handler that opens
 * whatever they actually use, which beats any guess we could make.
 */

import { NOSTR_CLIENTS } from '@/services/social/clients';
import { serverLocale } from '@/services/server/i18n/locale';
import Heading from '@/components/ui/layout/Heading';

export default async function OpenInClients({ identifier }: { identifier: string }) {
  const { t } = await serverLocale();

  return (
    <section className="min-w-0" data-testid="open-in-clients">
      <Heading as="h2" variant="label" className="mb-3">
        {t('social.note.openIn')}
      </Heading>
      {/*
        Wraps on a narrow rail and stays a single flowing row on mobile, so
        one list works in both places without a second layout.
      */}
      <List marker="none" spacing="none" className="flex flex-wrap gap-2">
        {NOSTR_CLIENTS.map((client) => (
          <li key={client.id}>
            <Link
              href={client.event(identifier)}
              // A `nostr:` URI has to stay in this tab for the OS handler to
              // claim it; opening a new tab would just fail to navigate.
              {...(client.isHandler ? {} : { target: '_blank', rel: 'noreferrer noopener' })}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs transition-colors ${
                client.isHandler
                  ? 'border-lc-green/40 bg-lc-green/10 text-lc-green hover:bg-lc-green/20'
                  : 'border-lc-border bg-lc-dark text-lc-white hover:border-lc-green/40'
              }`}
              data-testid={`open-in-${client.id}`}
            >
              {client.nameKey ? t(client.nameKey) : client.name}
            </Link>
          </li>
        ))}
      </List>
    </section>
  );
}
