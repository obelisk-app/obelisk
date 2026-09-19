/**
 * "Open in" — the other Nostr clients that can display this event.
 *
 * This belongs on the viewer page, not in the ⋯ menu of every note card.
 * Inside the app the reader is already in a client and the menu is for
 * acting on a note; here they've arrived from a shared link and may well
 * prefer their own client, which is exactly the moment the offer is useful.
 *
 * `nostr:` comes first: on a device with a registered handler that opens
 * whatever they actually use, which beats any guess we could make.
 */

import { NOSTR_CLIENTS } from '@/lib/social/clients';

export default function OpenInClients({ identifier }: { identifier: string }) {
  return (
    <section className="min-w-0" data-testid="open-in-clients">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-lc-muted">
        Open in
      </h2>
      {/*
        Wraps on a narrow rail and stays a single flowing row on mobile, so
        one list works in both places without a second layout.
      */}
      <ul className="flex flex-wrap gap-2">
        {NOSTR_CLIENTS.map((client) => (
          <li key={client.id}>
            <a
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
              {client.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
