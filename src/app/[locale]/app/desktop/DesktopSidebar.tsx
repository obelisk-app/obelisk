'use client';

import { useTranslations } from 'next-intl';
import ServerRail from '../rail/ServerRail';
import DmList from '../dm/DmList';
import { DMOptInBoundary } from '../dm/DmOptInBoundary';
import { ResizablePane } from './ResizablePane';
import { Sidebar } from '../panes/sidebar/Sidebar';
import type { View } from '@/utils/shell/desktop/view';
import type { RailMode } from '@/utils/shell/desktop/desktop-layout';
import { SIDEBAR_KEY } from '@/constants/shell/desktop';
import { useDesktopSidebar } from '@/hooks/shell/desktop/useDesktopSidebar';

type Props = {
  relay: string;
  conn: string;
  view: View;
  setView: (v: View) => void;
  railMode: RailMode;
  leaveDms: () => void;
  onToggleFeed: () => void;
  onSidebarWidth: (width: number) => void;
};

/** The relay rail and resizable channel or DM list beside the desktop content. */
export function DesktopSidebar({
  relay, conn, view, setView, railMode, leaveDms, onToggleFeed, onSidebarWidth,
}: Props) {
  const t = useTranslations();
  const vm = useDesktopSidebar({ relay, setView });
  return (
    <div className="flex">
      <ServerRail
        mode={railMode}
        onPickDM={vm.pickDm}
        onPickFeed={onToggleFeed}
        onPickRelay={vm.pickRelay}
      />
      {view.kind !== 'feed' && <ResizablePane storageKey={SIDEBAR_KEY} defaultWidth={264} min={200} max={500} onWidthChange={onSidebarWidth}>
        {view.kind === 'dm' ? (
          <DMOptInBoundary surface="sidebar" secondaryLabel={t('dm.optIn.notNow')} onSecondary={leaveDms}>
            <DmList
              activePeer={view.peer}
              onPick={vm.pickPeer}
            />
          </DMOptInBoundary>
        ) : (
          <Sidebar
            relay={relay}
            conn={conn}
            view={view}
            setView={setView}
          />
        )}
      </ResizablePane>}
    </div>
  );
}
