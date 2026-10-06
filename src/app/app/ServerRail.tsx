'use client';

/**
 * Discord-style server rail. Mirrors obelisk's identity bar:
 *   ┌──┐
 *   │▶ │  ← DM tile (paper-airplane icon, first slot)
 *   └──┘
 *   ────  ← hairline separator
 *   [Ø]   ← relay tiles (one per configured relay)
 *   [+]   ← add-relay button
 *
 * Active item shows a green vertical pill on the left.
 * Tiles morph from rounded-square to circle on hover.
 */

import { useState } from 'react';
import { useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { AddRelayModal } from './rail/AddRelayModal';
import { RailTile } from './rail/RailTile';
import { RelayTile } from './rail/RelayTile';
import { confirmAndRemoveRelay } from '@/services/remove-relay';


type RailMode = { kind: 'dm' } | { kind: 'feed' } | { kind: 'relay'; url: string };

export default function ServerRail({
  mode,
  onPickDM,
  onPickFeed,
  onPickRelay,
}: {
  mode: RailMode;
  onPickDM: () => void;
  onPickFeed?: () => void;
  onPickRelay: (url: string) => void;
}) {
  const relays = useConfiguredRelays();
  const currentRelay = useCurrentRelayUrl();
  const [adding, setAdding] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 py-3">
      <RailTile
        active={mode.kind === 'dm'}
        title={t('rail.directMessages')}
        hint="rail-dm"
        onClick={onPickDM}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        }
        emphasis
      />

      {/*
        The Nostr feed sits with DMs rather than with the relay tiles below:
        both are account-wide surfaces that don't belong to any one NIP-29
        relay, whereas each relay tile IS a server. Grouping it under the
        relays would imply the feed changes when you switch servers.
      */}
      {onPickFeed && (
        <RailTile
          active={mode.kind === 'feed'}
          title={t('rail.nostrFeed')}
          hint="rail-feed"
          onClick={onPickFeed}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          }
          emphasis
        />
      )}

      <div className="my-1 h-px w-8 bg-lc-border" />

      {relays.map((url, index) => {
        const active = mode.kind === 'relay' && currentRelay === url;
        return (
          <RelayTile
            key={url}
            url={url}
            active={active}
            // Only the first tile carries it: the others are the same
            // control, and a dot on each would read as unread traffic.
            hint={index === 0 ? 'rail-relay' : undefined}
            onClick={() => onPickRelay(url)}
            onRemove={() => { void confirmAndRemoveRelay(url, relays.length, t); }}
          />
        );
      })}

      <button
        onClick={() => setAdding(true)}
        title={t('rail.addRelay')}
        aria-label={t('rail.addRelay')}
        data-tour="rail-add-relay"
        className="group/tile relative flex h-12 w-12 items-center justify-center rounded-2xl bg-lc-card text-lc-green ring-1 ring-lc-border transition-all duration-150 hover:rounded-xl hover:bg-lc-green/15 hover:ring-lc-green"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {adding && <AddRelayModal onClose={() => setAdding(false)} />}
    </div>
  );
}
