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
import { useDesktopDrawer } from '@/hooks/shell/desktop/useDesktopDrawer';

type Props = {
  relay: string;
  conn: string;
  view: View;
  setView: (v: View) => void;
  railMode: RailMode;
  sidebarOpen: boolean;
  closeDrawer: () => void;
  leaveDms: () => void;
  onToggleFeed: () => void;
  onSidebarWidth: (width: number) => void;
};

/**
 * The relay rail plus the channel list (or DM list). Inline on desktop; on a
 * narrow window it is a drawer over a backdrop that taps closed.
 */
export function DesktopDrawer({
  relay, conn, view, setView, railMode, sidebarOpen, closeDrawer, leaveDms, onToggleFeed, onSidebarWidth,
}: Props) {
  const t = useTranslations();
  const vm = useDesktopDrawer({ relay, setView, closeDrawer });
  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeDrawer}
          aria-hidden
        />
      )}
      {/* Sidebar drawer: fixed on mobile, inline on desktop */}
      <div
        className={
          'flex max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl ' +
          'max-md:transform max-md:transition-transform max-md:duration-200 max-md:ease-in-out ' +
          (sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full')
        }
      >
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
              setView={vm.pickView}
            />
          )}
        </ResizablePane>}
      </div>
    </>
  );
}
