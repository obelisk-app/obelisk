/**
 * "Open in" — other Nostr clients that can display an event.
 *
 * A note is a public event, not Obelisk's property: the reader may well
 * prefer their own client, and refusing to help them get there is both
 * unfriendly and pointless, since they can decode the id anyway.
 *
 * This replaces the single "open on njump" link. njump is itself just another
 * viewer, and `/notes` now does that job — so linking to it meant handing
 * readers to a competitor's preview page for no benefit. Offering the whole
 * field is more useful and keeps Obelisk as the default.
 *
 * `nostr:` first: on a device with a registered `web+nostr` / `nostr` handler
 * that opens whatever the reader actually uses, which is the best answer we
 * can give.
 */

export type NostrClient = {
  id: string;
  name: string;
  /** Build a URL for an event identifier (nevent/naddr/note). */
  event: (identifier: string) => string;
  /** Build a URL for a profile identifier (npub/nprofile). */
  profile?: (identifier: string) => string;
  /** The OS/browser handler rather than a hosted web client. */
  isHandler?: boolean;
};

export const NOSTR_CLIENTS: NostrClient[] = [
  {
    id: 'default',
    name: 'Your default app',
    event: (id) => `nostr:${id}`,
    profile: (id) => `nostr:${id}`,
    isHandler: true,
  },
  {
    id: 'jumble',
    name: 'Jumble',
    event: (id) => `https://jumble.social/notes/${id}`,
    profile: (id) => `https://jumble.social/users/${id}`,
  },
  {
    id: 'coracle',
    name: 'Coracle',
    event: (id) => `https://coracle.social/${id}`,
    profile: (id) => `https://coracle.social/${id}`,
  },
  {
    id: 'yakihonne',
    name: 'YakiHonne',
    event: (id) => `https://yakihonne.com/notes/${id}`,
    profile: (id) => `https://yakihonne.com/users/${id}`,
  },
  {
    id: 'primal',
    name: 'Primal',
    event: (id) => `https://primal.net/e/${id}`,
    profile: (id) => `https://primal.net/p/${id}`,
  },
  {
    id: 'nostrudel',
    name: 'noStrudel',
    event: (id) => `https://nostrudel.ninja/#/n/${id}`,
    profile: (id) => `https://nostrudel.ninja/#/u/${id}`,
  },
];

export function clientEventUrl(client: NostrClient, identifier: string): string {
  return client.event(identifier);
}

export function clientProfileUrl(client: NostrClient, identifier: string): string | null {
  return client.profile ? client.profile(identifier) : null;
}
