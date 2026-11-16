'use client';
import { Fragment } from 'react';
import { useServerRail } from '@/hooks/shell/rail/useServerRail';
import type { RailMode } from '@/utils/shell/desktop/desktop-layout';
import ConcordRailTile from '../concord/ConcordRailTile';
import { RelayTile } from './RelayTile';

export default function CommunityRail({ mode, onPickRelay }: { mode: RailMode; onPickRelay: (url: string) => void }) {
  const vm = useServerRail(mode);
  return <>{vm.entries.map((entry, index) => <Fragment key={entry.key}>{entry.kind === 'concord'
    ? <ConcordRailTile key={entry.key} community={entry.community} active={vm.isConcordActive(entry.key)} onClick={() => vm.selectConcord(entry.key)} />
    : <RelayTile key={entry.key} url={entry.url} active={vm.isActive(entry.url)} hint={index === 0 ? 'rail-relay' : undefined}
      onClick={() => vm.leaveConcord(() => onPickRelay(entry.url))} onRemove={() => vm.remove(entry.url)} />}</Fragment>)}</>;
}
