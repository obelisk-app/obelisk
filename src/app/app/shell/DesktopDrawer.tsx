'use client';

import { nostrActions } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import ServerRail from '../ServerRail';
import DMList from '../DMList';
import { DMOptInBoundary } from '../DMOptInGate';
import { ResizablePane } from '../panes/ResizablePane';
import { Sidebar } from '../panes/Sidebar';
import type { View } from '@/utils/shell/view';
import { SIDEBAR_KEY, type RailMode } from '@/utils/shell/desktop-layout';

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
  const { t } = useTranslation();
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
          onPickDM={() => { setView({ kind: 'dm', peer: null }); closeDrawer(); }}
          onPickFeed={onToggleFeed}
          onPickRelay={async (url) => {
            setView({ kind: 'empty' });
            try {
              if (url !== relay) await nostrActions.switchRelay(url);
            } catch (err) {
              console.warn('[appshell] switchRelay from rail failed', err);
            } finally {
              closeDrawer();
            }
          }}
        />
        {view.kind !== 'feed' && <ResizablePane storageKey={SIDEBAR_KEY} defaultWidth={264} min={200} max={500} onWidthChange={onSidebarWidth}>
          {view.kind === 'dm' ? (
            <DMOptInBoundary surface="sidebar" secondaryLabel={t('dm.optIn.notNow')} onSecondary={leaveDms}>
              <DMList
                activePeer={view.peer}
                onPick={(p) => { setView({ kind: 'dm', peer: p }); closeDrawer(); }}
              />
            </DMOptInBoundary>
          ) : (
            <Sidebar
              relay={relay}
              conn={conn}
              view={view}
              setView={(v) => { setView(v); closeDrawer(); }}
            />
          )}
        </ResizablePane>}
      </div>
    </>
  );
}
