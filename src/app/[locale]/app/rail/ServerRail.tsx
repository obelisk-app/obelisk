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

import { useTranslations } from 'next-intl';
import { useServerRail } from '@/hooks/shell/rail/useServerRail';
import type { RailMode } from '@/utils/shell/desktop/desktop-layout';
import { AddRelayModal } from './AddRelayModal';
import { RailTile } from './RailTile';
import { RelayTile } from './RelayTile';
import { GlobeIcon, PaperPlaneIcon, PlusIcon } from '@/assets/icons';

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
  const t = useTranslations();
  const vm = useServerRail(mode);

  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 py-3">
      <RailTile
        active={mode.kind === 'dm'}
        title={t('shell.rail.directMessages')}
        hint="rail-dm"
        onClick={onPickDM}
        icon={
          <PaperPlaneIcon size={22} strokeWidth={2} />
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
          title={t('shell.rail.nostrFeed')}
          hint="rail-feed"
          onClick={onPickFeed}
          icon={
            <GlobeIcon size={22} strokeWidth={2} />
          }
          emphasis
        />
      )}

      <div className="my-1 h-px w-8 bg-lc-border" />

      {/* Only the first tile carries the hint: the others are the same
          control, and a dot on each would read as unread traffic. */}
      {vm.relays.map((url, index) => (
        <RelayTile
          key={url}
          url={url}
          active={vm.isActive(url)}
          hint={index === 0 ? 'rail-relay' : undefined}
          onClick={() => onPickRelay(url)}
          onRemove={() => vm.remove(url)}
        />
      ))}

      <button
        onClick={vm.openAdd}
        title={t('shell.rail.addRelay')}
        aria-label={t('shell.rail.addRelay')}
        data-tour="rail-add-relay"
        className="group/tile relative flex h-12 w-12 items-center justify-center rounded-2xl bg-lc-card text-lc-green ring-1 ring-lc-border transition-all duration-150 hover:rounded-xl hover:bg-lc-green/15 hover:ring-lc-green"
      >
        <PlusIcon size={22} strokeWidth={2.5} />
      </button>

      {vm.adding && <AddRelayModal onClose={vm.closeAdd} />}
    </div>
  );
}
