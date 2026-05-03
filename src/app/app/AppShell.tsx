'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useIsLoggedIn,
  useConnectionState,
  useCurrentRelayUrl,
  useGroups,
  useMessages,
  useUserMetadata,
  useReactions,
  useChildrenByParent,
  useAdminsByGroup,
  useDirectMessages,
  useAdmins,
  useMembers,
  useGroupCreator,
  useMyMutes,
  useRelayAccess,
  useMyLoginMethod,
  type JsGroup,
  type JsMessage,
  type JsUserMetadata,
} from '@/lib/nostr-bridge';
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge';
import { faviconFor, fetchRelayInfo } from '@/lib/relay-info';
import ServerRail from './ServerRail';
import DMList from './DMList';
import LoginModal from './LoginModal';
import UserPanel from './UserPanel';
import SearchBar from './SearchBar';
import MessageContent from '@/components/chat/MessageContent';
import MemberList from '@/components/chat/MemberList';
import RelayAdminPanel from '@/components/admin/RelayAdminPanel';
import VoiceRoom from '@/components/voice/VoiceRoom';
import ForumView from '@/components/chat/ForumView';
import VoiceStatusBar from '@/components/voice/VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { useVoiceChatPane } from '@/hooks/chat/useVoiceChatPane';
import { useChatStore } from '@/store/chat';
import type { MemberInfo } from '@/lib/mentions';
import { useToastStore } from '@/store/toast';
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  SEARCHABLE_EMOJI,
  normalizeEmojiKeyword,
} from '@/components/chat/emoji-data';
import { useMessageZaps, type MessageZapTotal } from '@/hooks/chat/useMessageZaps';
import { useMessageZapStore } from '@/store/messageZap';
import MessageZapModal from '@/components/chat/MessageZapModal';
import { parseZapCommand } from '@/lib/wallet/parse-zap-command';
import MentionAutocomplete from '@/components/chat/MentionAutocomplete';
import SlashCommandAutocomplete, { SLASH_COMMANDS, type SlashCommand } from '@/components/chat/SlashCommandAutocomplete';
import SlashCommandScaffold, { scaffoldMentionSlotQuery } from '@/components/chat/SlashCommandScaffold';
import { filterMembers } from '@/lib/mentions';
import { nip19 } from 'nostr-tools';
import {
  useChannelLayout,
  useRelayOperatorPubkey,
  applyLayout,
  publishLayout,
  newCategoryId,
  type ChannelLayout,
} from '@/lib/channel-layout';
import {
  useRelayBranding,
  publishBranding,
  type RelayBranding,
} from '@/lib/relay-branding';
import BlossomImageInput from '@/components/BlossomImageInput';
import ActivityIndicator from '@/components/ActivityIndicator';
import { extractUrls, isImageUrl } from '@/lib/markdown';

type View =
  | { kind: 'group'; groupId: string }
  | { kind: 'dm'; peer: string | null }
  | { kind: 'empty' };

const SIDEBAR_KEY = 'obelisk-dex/sidebar-width';
const MEMBERS_KEY = 'obelisk-dex/members-width';
const SHOW_MEMBERS_KEY = 'obelisk-dex/show-members';

export default function AppShell() {
  const isLoggedIn = useIsLoggedIn();
  const conn = useConnectionState();
  const relay = useCurrentRelayUrl();
  const [view, setView] = useState<View>({ kind: 'empty' });

  useEffect(() => {
    if (view.kind === 'group') nostrActions.setActiveGroup(view.groupId);
    else nostrActions.setActiveGroup(null);
  }, [view]);

  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  // Deep-link: ?c=<groupId>[&m=<messageId>] auto-selects a channel on first
  // render and (when m is present) scrolls/flashes the target message.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get('c');
    const m = params.get('m');
    if (c) setView({ kind: 'group', groupId: c });
    if (m) setPendingMessageId(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the active group so refresh / share works.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (view.kind === 'group') url.searchParams.set('c', view.groupId);
    else url.searchParams.delete('c');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [view]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 264;
    const v = window.localStorage.getItem(SIDEBAR_KEY);
    const n = v ? parseInt(v, 10) : 264;
    return Number.isFinite(n) ? Math.max(200, Math.min(500, n)) : 264;
  });
  const [showMembers, setShowMembers] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(SHOW_MEMBERS_KEY);
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_MEMBERS_KEY, showMembers ? '1' : '0');
  }, [showMembers]);

  if (!isLoggedIn) return (<><LoginModal /><ActivityIndicator /></>);

  const railMode: { kind: 'dm' } | { kind: 'relay'; url: string } =
    view.kind === 'dm' ? { kind: 'dm' } : { kind: 'relay', url: relay };

  const closeDrawer = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-lc-black text-lc-white">
      <MessageZapModal />
      <RelayAccessModal />
      <RelayTopBar relay={relay} onOpenSidebar={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden relative">
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
            onPickRelay={async (url) => {
              if (url !== relay) await nostrActions.switchRelay(url);
              setView({ kind: 'empty' });
              closeDrawer();
            }}
          />
          <ResizablePane storageKey={SIDEBAR_KEY} defaultWidth={264} min={200} max={500} onWidthChange={setSidebarWidth}>
            {view.kind === 'dm' ? (
              <DMList
                activePeer={view.peer}
                onPick={(p) => { setView({ kind: 'dm', peer: p }); closeDrawer(); }}
              />
            ) : (
              <Sidebar
                relay={relay}
                conn={conn}
                view={view}
                setView={(v) => { setView(v); closeDrawer(); }}
              />
            )}
          </ResizablePane>
        </div>
        <main className="flex flex-1 flex-col overflow-hidden bg-lc-black min-w-0 border-l border-t border-r border-lc-border">
          {view.kind === 'group' ? (
            <ChatLayout
              groupId={view.groupId}
              showMembers={showMembers}
              onToggleMembers={() => setShowMembers((v) => !v)}
              pendingMessageId={pendingMessageId}
              onConsumePendingMessageId={() => setPendingMessageId(null)}
              onSelectGroup={(gid) => setView({ kind: 'group', groupId: gid })}
            />
          ) : view.kind === 'dm' ? (
            <DMPanel peer={view.peer} onPickPeer={(p) => setView({ kind: 'dm', peer: p })} />
          ) : (
            <EmptyState />
          )}
        </main>
        <FloatingUserPanel sidebarWidth={sidebarWidth} />
      </div>
      <ActivityIndicator />
    </div>
  );
}

function FloatingUserPanel({ sidebarWidth }: { sidebarWidth: number }) {
  // Server rail is 72px wide; panel sits 8px from left with 8px right gap to
  // the sidebar's right edge, so it spans the full sidebar+rail width.
  const width = 72 + sidebarWidth - 16;
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-2 z-30 hidden md:flex flex-col gap-2"
      style={{ width: `${width}px` }}
    >
      <div className="pointer-events-auto empty:hidden [&>[data-testid=voice-status-bar]]:!p-0 [&_[data-testid=voice-status-bar]>div]:bg-lc-card/95 [&_[data-testid=voice-status-bar]>div]:shadow-2xl [&_[data-testid=voice-status-bar]>div]:backdrop-blur">
        <VoiceStatusBar />
      </div>
      <div className="pointer-events-auto flex min-h-[3.5rem] items-center rounded-xl border border-lc-border bg-lc-card/95 px-4 shadow-2xl backdrop-blur">
        <SidebarMe />
      </div>
    </div>
  );
}

function RelayTopBar({ relay, onOpenSidebar }: { relay: string; onOpenSidebar?: () => void }) {
  const [info, setInfo] = useState<{ name?: string; icon?: string } | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setIconFailed(false);
    fetchRelayInfo(relay).then((r) => {
      if (!alive) return;
      setInfo({ name: r?.name, icon: r?.icon || faviconFor(relay) || undefined });
    });
    return () => {
      alive = false;
    };
  }, [relay]);
  const displayName = info?.name || shortHost(relay);
  const iconUrl = info?.icon;
  return (
    <div
      className="h-10 shrink-0 bg-lc-black px-3"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/50 transition-colors md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        <button
          className="p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/40 transition-colors"
          title="Inbox"
          aria-label="Inbox"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </button>
        <a
          href="/"
          className="p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/40 transition-colors inline-flex"
          title="Help"
          aria-label="Help"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </a>
      </div>
      <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
        {iconUrl && !iconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt=""
            onError={() => setIconFailed(true)}
            className="w-5 h-5 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-[10px] font-bold shrink-0">
            {displayName[0]?.toUpperCase() || 'R'}
          </div>
        )}
        <span className="text-xs font-semibold text-lc-white truncate">{displayName}</span>
      </div>
    </div>
  );
}

// -- Resizable pane -----------------------------------------------------

function ResizablePane({
  storageKey,
  defaultWidth,
  min,
  max,
  side = 'right',
  children,
  onWidthChange,
}: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  side?: 'right' | 'left';
  children: React.ReactNode;
  onWidthChange?: (w: number) => void;
}) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    const v = window.localStorage.getItem(storageKey);
    const n = v ? parseInt(v, 10) : defaultWidth;
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defaultWidth;
  });
  const startRef = useRef<{ x: number; w: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    startRef.current = { x: e.clientX, w: width };
    function onMove(ev: MouseEvent) {
      if (!startRef.current) return;
      const delta = ev.clientX - startRef.current.x;
      const next = side === 'right'
        ? startRef.current.w + delta
        : startRef.current.w - delta;
      const clamped = Math.max(min, Math.min(max, next));
      setWidth(clamped);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.localStorage.setItem(storageKey, String(width));
      startRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(width));
    onWidthChange?.(width);
  }, [storageKey, width, onWidthChange]);

  const handle = (
    <div
      onMouseDown={onMouseDown}
      className="group/handle relative w-1 cursor-col-resize bg-transparent hover:bg-lc-green/40 active:bg-lc-green/60 max-md:hidden"
      title="Drag to resize"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );

  return (
    <>
      {side === 'left' && handle}
      <div
        style={{ ['--pane-w' as string]: `${width}px` }}
        className="flex shrink-0 flex-col overflow-hidden bg-lc-dark border-l border-t border-r border-lc-border rounded-tl-xl w-[var(--pane-w)] max-md:w-[min(72vw,300px)]"
      >
        {children}
      </div>
      {side === 'right' && handle}
    </>
  );
}

// -- Login --------------------------------------------------------------

// -- Sidebar ------------------------------------------------------------

function Sidebar({
  relay,
  conn,
  view,
  setView,
}: {
  relay: string;
  conn: string;
  view: View;
  setView: (v: View) => void;
}) {
  const groups = useGroups();
  const childrenByParent = useChildrenByParent();
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roots = useMemo(
    () => groups.filter((g) => !g.parent || !groupsById[g.parent]),
    [groups, groupsById],
  );
  const myPubkey = useMyPubkey();
  const operatorPubkey = useRelayOperatorPubkey(relay || null);
  const adminsByGroup = useAdminsByGroup();
  // Channel list is gated on positive AUTH evidence: cached groups (loaded
  // by seedCacheForRelay before the relay handshake) must not paint until
  // the relay has either accepted us (→ 'ok') or proven AUTH is not
  // required by serving an event/EOSE. Otherwise users see channels they
  // can't actually read or post to, type a message, hit a silent CLOSED,
  // and only realize on the next refresh.
  const relayAccess = useRelayAccess(relay || null);
  const channelsVisible = relayAccess === 'ok';
  // Union of all admins across visible groups on this relay, plus the
  // NIP-11 operator pubkey if the relay advertises one. This is the set of
  // pubkeys allowed to author the relay-wide layout/branding events.
  const relayAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const pk of adminsByGroup[g.id] ?? []) set.add(pk);
    }
    if (operatorPubkey) set.add(operatorPubkey);
    return Array.from(set);
  }, [groups, adminsByGroup, operatorPubkey]);
  const layout = useChannelLayout(relay || null, relayAuthors);
  const isOperator = !!myPubkey && relayAuthors.includes(myPubkey);
  const laidOut = useMemo(
    () => applyLayout(layout, roots.map((g) => g.id)),
    [layout, roots],
  );
  const branding = useRelayBranding(relay || null, relayAuthors);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  // Creator-admin claim used to live here as a blanket loop that published a
  // kind 9000 ['admin'] for every visible group on every login (gated only by
  // sessionStorage). With 1000 channels that meant 1000 events per device per
  // session, polluting the relay-wide moderation log that other NIP-29 clients
  // render as an activity feed. The claim is now lazy: see the settings-open
  // path further down which calls `nostrActions.claimCreatorAdmin(groupId)`
  // exactly once, only when the local user is the kind 9007 creator and isn't
  // already in 39001.

  const toggleCollapsed = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <>
      <div className="group relative shrink-0 border-b border-transparent shadow-sm transition-colors hover:border-lc-border">
        {branding.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.banner}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {branding.banner && (
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-lc-black/85 via-lc-black/40 to-transparent"
          />
        )}
        <div className="relative flex h-14 items-center gap-3 overflow-hidden px-4">
          {branding.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.icon}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-lc-border bg-lc-black object-cover"
            />
          )}
          <div className="min-w-0 flex-1 truncate text-base font-bold text-lc-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {branding.name || shortHost(relay)}
          </div>
          <span
            title={conn}
            aria-label={conn}
            className={
              'inline-block h-2.5 w-2.5 shrink-0 rounded-full ' +
              (conn === 'Connected' ? 'bg-lc-green' : conn === 'Connecting' ? 'bg-yellow-500' : 'bg-red-500')
            }
          />
          {isOperator && (
            <button
              onClick={() => setBrandingOpen(true)}
              title="Edit relay branding (group admins only)"
              aria-label="Edit relay branding"
              className="shrink-0 rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          )}
          {isOperator && (
            <button
              onClick={() => setLayoutOpen(true)}
              title="Manage categories & order (group admins only)"
              aria-label="Manage categories"
              className="shrink-0 rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          {isOperator && (
            <button
              onClick={() => setAdminPanelOpen(true)}
              title="Manage admins & members across every channel (group admins only)"
              aria-label="Manage admins and members"
              className="shrink-0 rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
          )}
        </div>
        {branding.banner && <div aria-hidden className="relative h-24" />}
      </div>

      {channelsVisible && (
        <CreateGroupSection
          count={groups.length}
          onCreated={(id) => setView({ kind: 'group', groupId: id })}
        />
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!channelsVisible && (
          <div className="px-2 py-3">
            <RelayAccessBanner compact />
          </div>
        )}
        {channelsVisible && groups.length === 0 && (
          <div className="px-2 py-3 text-xs text-lc-muted">Discovering channels… (kind 39000)</div>
        )}
        {channelsVisible && laidOut.categories.map((cat) => (
          <CategorySection
            key={cat.id}
            name={cat.name}
            collapsed={!!collapsed[cat.id]}
            onToggle={() => toggleCollapsed(cat.id)}
            channelCount={cat.channelIds.length}
          >
            {cat.channelIds.map((id) => {
              const g = groupsById[id];
              if (!g) return null;
              return (
                <GroupNode
                  key={id}
                  group={g}
                  depth={0}
                  childrenByParent={childrenByParent}
                  groupsById={groupsById}
                  view={view}
                  onSelect={(gid) => setView({ kind: 'group', groupId: gid })}
                />
              );
            })}
          </CategorySection>
        ))}
        {channelsVisible && laidOut.uncategorized.length > 0 && (
          laidOut.categories.length > 0 ? (
            <CategorySection
              name="Uncategorized"
              collapsed={!!collapsed['__uncat__']}
              onToggle={() => toggleCollapsed('__uncat__')}
              channelCount={laidOut.uncategorized.length}
            >
              {laidOut.uncategorized.map((id) => {
                const g = groupsById[id];
                if (!g) return null;
                return (
                  <GroupNode
                    key={id}
                    group={g}
                    depth={0}
                    childrenByParent={childrenByParent}
                    groupsById={groupsById}
                    view={view}
                    onSelect={(gid) => setView({ kind: 'group', groupId: gid })}
                  />
                );
              })}
            </CategorySection>
          ) : (
            laidOut.uncategorized.map((id) => {
              const g = groupsById[id];
              if (!g) return null;
              return (
                <GroupNode
                  key={id}
                  group={g}
                  depth={0}
                  childrenByParent={childrenByParent}
                  groupsById={groupsById}
                  view={view}
                  onSelect={(gid) => setView({ kind: 'group', groupId: gid })}
                />
              );
            })
          )
        )}
      </div>
      {layoutOpen && relay && (
        <ManageLayoutModal
          relayUrl={relay}
          layout={layout}
          channels={roots}
          onClose={() => setLayoutOpen(false)}
        />
      )}
      {brandingOpen && relay && (
        <RelayBrandingModal
          relayUrl={relay}
          branding={branding}
          onClose={() => setBrandingOpen(false)}
        />
      )}
      {adminPanelOpen && (
        <RelayAdminPanel onClose={() => setAdminPanelOpen(false)} />
      )}

      <div className="shrink-0 border-t border-lc-border bg-lc-card/50 md:hidden">
        <VoiceStatusBar />
        <div className="p-2">
          <SidebarMe />
        </div>
      </div>
    </>
  );
}

function CreateGroupSection({ count, onCreated }: { count: number; onCreated: (groupId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await nostrActions.createGroup({ name: name.trim(), isPublic: true, isOpen: true });
      setName('');
      setOpen(false);
      onCreated(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
        <span className="truncate">Channels · {count}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded px-1 text-base leading-none text-lc-muted hover:text-lc-green"
          title={open ? 'Cancel' : 'Create channel'}
          aria-label={open ? 'Cancel' : 'Create channel'}
        >
          {open ? '×' : '+'}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="mb-1 flex flex-col gap-1 px-3 pb-1">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel name"
              className="min-w-0 flex-1 rounded border border-lc-border bg-lc-black px-2 py-1 text-xs text-lc-white outline-none focus:border-lc-green"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="shrink-0 rounded bg-lc-green px-2 py-1 text-[11px] font-semibold text-lc-black disabled:opacity-50"
            >
              {busy ? '…' : 'Create'}
            </button>
          </div>
          {err && <span className="break-words text-[10px] text-red-400">{err}</span>}
        </form>
      )}
    </div>
  );
}

function GroupNode({
  group,
  depth,
  childrenByParent,
  groupsById,
  view,
  onSelect,
}: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Record<string, JsGroup>;
  view: View;
  onSelect: (id: string) => void;
}) {
  const childIds = childrenByParent[group.id] ?? [];
  const active = view.kind === 'group' && view.groupId === group.id;
  // Forum containers default to expanded so newly-created threads are
  // immediately visible. Persisted per-group in localStorage so the user's
  // choice survives reloads. Non-forum groups stay always-expanded (no
  // toggle rendered) — collapsing arbitrary nesting isn't part of this UX.
  const isCollapsible = group.kind === 'forum' && childIds.length > 0;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`obelisk-dex/forum-collapsed/${group.id}`) === '1';
  });
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      const key = `obelisk-dex/forum-collapsed/${group.id}`;
      if (next) window.localStorage.setItem(key, '1');
      else window.localStorage.removeItem(key);
    }
  };
  return (
    <>
      <div
        style={{ paddingLeft: `${0.5 + Math.max(0, depth - 1) * 0.85}rem` }}
        className={
          'flex w-full items-center gap-1 rounded text-left text-sm transition ' +
          (active
            ? 'bg-lc-olive text-lc-white'
            : 'text-lc-muted hover:bg-lc-card hover:text-lc-white')
        }
      >
        {depth > 0 && !isCollapsible && <span className="pl-1 text-lc-muted">↳</span>}
        <button
          onClick={() => onSelect(group.id)}
          className="flex flex-1 items-center gap-2 truncate px-1 py-1.5 text-left"
        >
          <span className="text-lc-muted">#</span>
          <span className="flex-1 truncate">{group.name ?? group.id.slice(0, 12)}</span>
          {!group.isPublic && <span title="Private" className="text-[10px]">🔒</span>}
          {!group.isOpen && <span title="Closed (invite only)" className="text-[10px]">⊝</span>}
        </button>
        {isCollapsible && (
          <button
            onClick={toggleCollapsed}
            className="shrink-0 px-2 py-1.5 text-sm text-lc-white/70 hover:text-lc-green"
            aria-label={collapsed ? 'Expand threads' : 'Collapse threads'}
            title={collapsed ? 'Expand threads' : 'Collapse threads'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        )}
      </div>
      {!collapsed && childIds.map((cid) => {
        const child = groupsById[cid];
        if (!child) return null;
        // For forum-container children (threads), only render in the sidebar
        // once the thread has ≥ 1 message — empty/aborted threads stay hidden
        // so the sidebar doesn't accumulate noise from accidental creates.
        if (group.kind === 'forum') {
          return (
            <ForumChildGroupNode
              key={cid}
              group={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              groupsById={groupsById}
              view={view}
              onSelect={onSelect}
            />
          );
        }
        return (
          <GroupNode
            key={cid}
            group={child}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            groupsById={groupsById}
            view={view}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

function ForumChildGroupNode(props: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Record<string, JsGroup>;
  view: View;
  onSelect: (id: string) => void;
}) {
  const messages = useMessages(props.group.id);
  if (messages.length === 0) return null;
  return <GroupNode {...props} />;
}

function CategorySection({
  name,
  collapsed,
  onToggle,
  channelCount,
  children,
}: {
  name: string;
  collapsed: boolean;
  onToggle: () => void;
  channelCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted hover:text-lc-white"
      >
        <span className="inline-block w-3 text-[8px]">{collapsed ? '▶' : '▼'}</span>
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px] font-normal opacity-60">{channelCount}</span>
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}

function RelayBrandingModal({
  relayUrl,
  branding,
  onClose,
}: {
  relayUrl: string;
  branding: RelayBranding;
  onClose: () => void;
}) {
  const [icon, setIcon] = useState(branding.icon);
  const [banner, setBanner] = useState(branding.banner);
  const [name, setName] = useState(branding.name);
  const [description, setDescription] = useState(branding.description);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await publishBranding(relayUrl, {
        icon: icon.trim(),
        banner: banner.trim(),
        name: name.trim(),
        description: description.trim(),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="lc-card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden bg-lc-dark"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-lc-border px-5 py-3">
          <div>
            <div className="text-base font-bold text-lc-white">Relay branding</div>
            <div className="text-[11px] text-lc-muted">Shown to everyone on {shortHost(relayUrl)} · NIP-78 kind 30078</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <BlossomImageInput
            label="Icon"
            value={icon}
            onChange={setIcon}
            shape="square"
            hint="Square logo shown next to the relay name."
          />
          <BlossomImageInput
            label="Banner"
            value={banner}
            onChange={setBanner}
            shape="wide"
            hint="Wide image shown above the relay name."
          />
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={shortHost(relayUrl)}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClasses}
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-lc-border px-5 py-3">
          <button onClick={onClose} className="lc-pill lc-pill-secondary text-xs">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ManageLayoutModal({
  relayUrl,
  layout,
  channels,
  onClose,
}: {
  relayUrl: string;
  layout: ChannelLayout;
  channels: ReadonlyArray<JsGroup>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ChannelLayout>(layout);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  // Whenever the upstream layout changes (e.g. relay echo) refresh the
  // draft *only* if the user hasn't started editing yet.
  useEffect(() => {
    setDraft((d) => (d.updatedAt === 0 ? layout : d));
  }, [layout]);

  const channelsById = useMemo(
    () => Object.fromEntries(channels.map((g) => [g.id, g])),
    [channels],
  );

  const laidOut = useMemo(
    () => applyLayout(draft, channels.map((g) => g.id)),
    [draft, channels],
  );

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setDraft((d) => ({
      ...d,
      categories: [...d.categories, { id: newCategoryId(), name, position: d.categories.length }],
    }));
    setNewCatName('');
  }

  function renameCategory(id: string, name: string) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c) => (c.id === id ? { ...c, name } : c)),
    }));
  }

  function deleteCategory(id: string) {
    setDraft((d) => ({
      categories: d.categories.filter((c) => c.id !== id),
      // Channels in this cat fall back to uncategorized.
      channels: d.channels.map((ch) =>
        ch.categoryId === id ? { ...ch, categoryId: null } : ch,
      ),
      updatedAt: d.updatedAt,
    }));
  }

  function moveCategory(id: string, delta: number) {
    setDraft((d) => {
      const arr = [...d.categories];
      const i = arr.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, categories: arr.map((c, k) => ({ ...c, position: k })) };
    });
  }

  function setChannelCategory(channelId: string, categoryId: string | null) {
    setDraft((d) => {
      const others = d.channels.filter((c) => c.id !== channelId);
      const sameBucket = others.filter((c) => c.categoryId === categoryId);
      return {
        ...d,
        channels: [
          ...others,
          { id: channelId, categoryId, position: sameBucket.length },
        ],
      };
    });
  }

  function moveChannel(channelId: string, delta: number) {
    setDraft((d) => {
      const ch = d.channels.find((c) => c.id === channelId);
      const catId = ch ? ch.categoryId : null;
      const bucket = laidOut.categories.find((c) => c.id === catId)?.channelIds
        ?? (catId === null ? laidOut.uncategorized : []);
      const i = bucket.indexOf(channelId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= bucket.length) return d;
      const newOrder = [...bucket];
      [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
      const others = d.channels.filter((c) => c.categoryId !== catId);
      return {
        ...d,
        channels: [
          ...others,
          ...newOrder.map((id, k) => ({ id, categoryId: catId, position: k })),
        ],
      };
    });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Normalize positions before publishing.
      const normalized: ChannelLayout = {
        categories: draft.categories.map((c, i) => ({ ...c, position: i })),
        channels: draft.channels.map((c, i) => ({ ...c, position: i })),
        updatedAt: Math.floor(Date.now() / 1000),
      };
      await publishLayout(relayUrl, normalized);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="lc-card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-lc-dark"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-lc-border px-5 py-3">
          <div>
            <div className="text-base font-bold text-lc-white">Categories &amp; order</div>
            <div className="text-[11px] text-lc-muted">Shared layout for {shortHost(relayUrl)} · any group admin can edit · NIP-78 kind 30078</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Add category */}
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">New category</div>
            <div className="flex gap-2">
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="e.g. General, Trading, Voice"
                className={inputClasses + ' flex-1'}
              />
              <button
                type="button"
                onClick={addCategory}
                disabled={!newCatName.trim()}
                className="shrink-0 rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>

          {/* Categories list */}
          <section className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">Categories</div>
            {laidOut.categories.length === 0 && (
              <div className="rounded-lg border border-dashed border-lc-border p-3 text-center text-xs text-lc-muted">
                No categories yet. Add one above to start organizing.
              </div>
            )}
            {laidOut.categories.map((cat, idx) => (
              <div key={cat.id} className="rounded-xl border border-lc-border bg-lc-black/40 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={cat.name}
                    onChange={(e) => renameCategory(cat.id, e.target.value)}
                    className="flex-1 rounded-lg border border-lc-border bg-lc-black px-2 py-1 text-sm font-semibold text-lc-white outline-none focus:border-lc-green"
                  />
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.id, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.id, +1)}
                    disabled={idx === laidOut.categories.length - 1}
                    className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCategory(cat.id)}
                    className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-lc-card"
                    title="Delete category"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {cat.channelIds.length === 0 ? (
                    <div className="rounded border border-dashed border-lc-border px-2 py-2 text-center text-[11px] text-lc-muted">
                      Drop channels here using the dropdown below
                    </div>
                  ) : (
                    cat.channelIds.map((id, i) => (
                      <ChannelOrderRow
                        key={id}
                        channel={channelsById[id]}
                        bucket={cat.id}
                        first={i === 0}
                        last={i === cat.channelIds.length - 1}
                        categories={laidOut.categories}
                        onMove={(d) => moveChannel(id, d)}
                        onChangeCategory={(catId) => setChannelCategory(id, catId)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* Uncategorized channels */}
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">
              Uncategorized · {laidOut.uncategorized.length}
            </div>
            <div className="space-y-1">
              {laidOut.uncategorized.length === 0 ? (
                <div className="rounded border border-dashed border-lc-border px-2 py-2 text-center text-[11px] text-lc-muted">
                  All channels are placed in categories.
                </div>
              ) : (
                laidOut.uncategorized.map((id, i) => (
                  <ChannelOrderRow
                    key={id}
                    channel={channelsById[id]}
                    bucket={null}
                    first={i === 0}
                    last={i === laidOut.uncategorized.length - 1}
                    categories={laidOut.categories}
                    onMove={(d) => moveChannel(id, d)}
                    onChangeCategory={(catId) => setChannelCategory(id, catId)}
                  />
                ))
              )}
            </div>
          </section>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-lc-border bg-lc-dark px-5 py-3">
          <div className="text-[11px] text-lc-muted">
            Saved as a single replaceable kind 30078 event signed by you.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
            >
              {saving ? 'Publishing…' : 'Publish layout'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ChannelOrderRow({
  channel,
  bucket,
  first,
  last,
  categories,
  onMove,
  onChangeCategory,
}: {
  channel: JsGroup | undefined;
  bucket: string | null;
  first: boolean;
  last: boolean;
  categories: ReadonlyArray<{ id: string; name: string }>;
  onMove: (delta: number) => void;
  onChangeCategory: (catId: string | null) => void;
}) {
  if (!channel) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5">
      <span className="text-lc-muted">#</span>
      <span className="flex-1 truncate text-sm text-lc-white">
        {channel.name ?? channel.id.slice(0, 12)}
      </span>
      <select
        value={bucket ?? ''}
        onChange={(e) => onChangeCategory(e.target.value || null)}
        className="rounded border border-lc-border bg-lc-dark px-1.5 py-0.5 text-xs text-lc-white outline-none focus:border-lc-green"
      >
        <option value="">— uncategorized —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={first}
        className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white disabled:opacity-30"
        title="Move up"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => onMove(+1)}
        disabled={last}
        className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white disabled:opacity-30"
        title="Move down"
      >
        ▼
      </button>
    </div>
  );
}

function useMyPubkey(): string | null {
  return useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('obelisk-dex/session')
        ?? window.localStorage.getItem('obeliskord/session');
      return raw ? (JSON.parse(raw) as { pubKeyHex: string }).pubKeyHex : null;
    } catch {
      return null;
    }
  }, []);
}

function SidebarMe() {
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!myPubkey) return null;
  return (
    <div className="relative flex w-full items-center gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-lc-card/50"
        title="Account"
      >
        <Avatar pubkey={myPubkey} size={8} picture={meta?.picture ?? null} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-lc-white">
            {meta?.displayName || meta?.name || 'You'}
          </div>
          <div className="truncate font-mono text-[10px] text-lc-muted">{myPubkey.slice(0, 16)}…</div>
        </div>
      </button>
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 rounded p-1.5 text-lc-muted hover:bg-lc-card hover:text-lc-white transition-colors"
        title="Settings"
        aria-label="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
      {open && (
        <UserPanel
          pubkey={myPubkey}
          isMe
          onClose={() => setOpen(false)}
          onLogout={() => { nostrActions.logout(); setOpen(false); }}
        />
      )}
      {editing && (
        <UserPanel
          pubkey={myPubkey}
          isMe
          initialEditing
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// -- Chat layout (chat + member list) -----------------------------------

function ChatLayout({
  groupId,
  showMembers,
  onToggleMembers,
  pendingMessageId,
  onConsumePendingMessageId,
  onSelectGroup,
}: {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
  onSelectGroup: (groupId: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatPanel
        groupId={groupId}
        showMembers={showMembers}
        onToggleMembers={onToggleMembers}
        pendingMessageId={pendingMessageId}
        onConsumePendingMessageId={onConsumePendingMessageId}
        onSelectGroup={onSelectGroup}
      />
    </div>
  );
}

function ChatPanel({
  groupId,
  showMembers,
  onToggleMembers,
  pendingMessageId,
  onConsumePendingMessageId,
  onSelectGroup,
}: {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
  onSelectGroup: (groupId: string) => void;
}) {
  const messages = useMessages(groupId);
  const reactions = useReactions(groupId);
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const zapTotals = useMessageZaps(messageIds);
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const admins = useAdmins(groupId);
  const myPubkey = useMyPubkey();
  const isAdmin = !!myPubkey && admins.includes(myPubkey);
  const groupCreator = useGroupCreator(groupId);
  const relay = useCurrentRelayUrl();
  // Messages and the compose form are gated on positive AUTH evidence so
  // an empty cached message list (or worse, half-loaded older messages)
  // doesn't trick the user into typing into a channel the relay hasn't
  // yet authorized them to read or post to. See RelayAccessBanner for
  // the surfaced state.
  const relayAccess = useRelayAccess(relay || null);
  const messagesVisible = relayAccess === 'ok';
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<JsMessage | null>(null);
  useEffect(() => { setReplyingTo(null); }, [groupId]);

  // Lazy creator-admin claim. The blanket login-time loop that used to
  // publish a kind 9000 ['admin'] for every visible group has been removed.
  // Instead, when the active session opens a channel they themselves
  // created (kind 9007 author == myPubkey) and the relay hasn't already
  // listed them in 39001, fire exactly one kind 9000 ['admin']. The
  // localStorage key persists across sessions so this never re-fires.
  useEffect(() => {
    if (!myPubkey || !groupCreator) return;
    if (groupCreator !== myPubkey) return;
    if (admins.includes(myPubkey)) return;
    const key = `obelisk:claimed-admin:${relay}:${groupId}:${myPubkey}`;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) return;
      localStorage?.setItem(key, '1');
    } catch {}
    void nostrActions.claimCreatorAdmin(groupId).catch((err) => {
      console.warn('[appshell] claimCreatorAdmin failed', err);
    });
  }, [groupId, myPubkey, groupCreator, admins, relay]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceMainRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const voiceChatOpen = useVoiceStore((s) => s.isVoiceChatOpen);
  const setVoiceChatOpen = useVoiceStore((s) => s.setVoiceChatOpen);
  const { voiceChatWidth, onVoiceChatResize: onResize } = useVoiceChatPane(voiceChatOpen, voiceMainRef);

  useEffect(() => {
    if (pendingMessageId) return; // wait for the deep-link scroll instead
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, groupId, pendingMessageId]);

  useEffect(() => {
    if (!pendingMessageId) return;
    const exists = messages.some((m) => m.id === pendingMessageId);
    if (!exists) return; // message not loaded yet — try again on next batch
    const el = document.querySelector(`[data-msg-id="${pendingMessageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-1', 'ring-lc-green');
    setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), 1800);
    // Strip ?m= so a refresh doesn't re-trigger.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('m');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    onConsumePendingMessageId();
  }, [pendingMessageId, messages, onConsumePendingMessageId]);

  // ── @-mention autocomplete ────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const memberPubkeys = useMembers(groupId);
  const [metaMap, setMetaMap] = useState<Record<string, JsUserMetadata>>({});
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void getBridge().then(() => {
      const impl = getBridgeImpl();
      if (!impl) return;
      unsub = impl.userMetadata.subscribe((m) => setMetaMap(m));
    });
    return () => { unsub?.(); };
  }, []);
  const memberInfos = useMemo<MemberInfo[]>(() => {
    return memberPubkeys.map((pk) => {
      const m = metaMap[pk];
      return {
        pubkey: pk,
        displayName: m?.displayName || m?.name || `${pk.slice(0, 8)}…`,
        picture: m?.picture ?? undefined,
        lud16: m?.lud16 ?? undefined,
      };
    });
  }, [memberPubkeys, metaMap]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const filteredMembers = useMemo(
    () => (mentionQuery === null ? [] : filterMembers(memberInfos, mentionQuery).slice(0, 8)),
    [memberInfos, mentionQuery],
  );
  const slashResults = useMemo<SlashCommand[]>(
    () => slashQuery === null ? [] : SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery.toLowerCase())),
    [slashQuery],
  );
  const activeSlashCommand = useMemo<SlashCommand | null>(() => {
    const m = /^\/([a-zA-Z]+)(?:\s|$)/.exec(draft);
    if (!m) return null;
    return SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase()) ?? null;
  }, [draft]);
  function detectMention(value: string, cursor: number) {
    setCaret(cursor);
    const sm = /^\/([a-zA-Z]*)$/.exec(value);
    if (sm) {
      setSlashQuery(sm[1]);
      setSlashIndex(0);
      setMentionQuery(null);
      return;
    }
    setSlashQuery(null);
    const m0 = /^\/([a-zA-Z]+)(?:\s|$)/.exec(value);
    const cmd = m0 ? SLASH_COMMANDS.find((c) => c.name === m0[1].toLowerCase()) : null;
    if (cmd) {
      const slot = scaffoldMentionSlotQuery(value, cursor);
      if (slot !== null) {
        setMentionQuery(slot);
        setMentionIndex(0);
        return;
      }
    }
    const before = value.slice(0, cursor);
    const m = before.match(/(?:^|\s)@(\w*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }
  function insertSlashCommand(cmd: SlashCommand) {
    const next = `/${cmd.name} `;
    setDraft(next);
    setSlashQuery(null);
    requestAnimationFrame(() => {
      const ta = inputRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(next.length, next.length);
      setCaret(next.length);
    });
  }
  function applyMention(member: MemberInfo) {
    const ta = inputRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const token = `nostr:${nip19.npubEncode(member.pubkey)} `;
    let replaced: string;
    if (/@(\w*)$/.test(before)) {
      replaced = before.replace(/@(\w*)$/, () => token);
    } else {
      // Slash-command slot picker can open without an `@` typed (e.g. `/zap `).
      // Insert at the cursor with a leading space if needed.
      const sep = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
      replaced = before + sep + token;
    }
    const next = replaced + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = replaced.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }
  function onMentionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashQuery !== null && slashResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashResults.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertSlashCommand(slashResults[slashIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashQuery(null); return; }
    }
    if (mentionQuery === null || filteredMembers.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredMembers.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(filteredMembers[mentionIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); }
  }

  const [uploadingMedia, setUploadingMedia] = useState(false);
  async function onPickFiles(files: File[]) {
    if (files.length === 0) return;
    // Cap at 4 — matches the gallery's 2x2 matrix renderer.
    const batch = files.slice(0, 4);
    setUploadingMedia(true);
    setSendError(null);
    try {
      const { uploadToBlossom } = await import('@/lib/blossom');
      const urls = await Promise.all(batch.map((f) => uploadToBlossom(f)));
      // Inline-attach: append each Blossom URL on its own line. Renderers
      // detect bare image/video URLs and render them as media (NIP-92-style).
      setDraft((d) => {
        const base = d.trim();
        return base ? `${base}\n${urls.join('\n')}` : urls.join('\n');
      });
    } catch (err) {
      setSendError((err as Error).message || 'Upload failed');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    // /zap [user] [amount] — frontend-only.
    //   /zap                → reply target (or last channel msg from someone else)
    //   /zap 100            → same target, with amount preset
    //   /zap <npub|hex|@name> [amount] → target that channel member
    if (/^\/zap(\s|$)/.test(content)) {
      const parsed = parseZapCommand(content, groupId, messages, myPubkey, replyingTo);
      if (!parsed.ok) {
        setSendError(parsed.error);
        return;
      }
      useMessageZapStore.getState().open(parsed.target);
      setDraft('');
      setReplyingTo(null);
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      // Lazy member self-add for open groups. Without this, a user who has
      // never been explicitly added by an admin can read but their first
      // kind 9 send is rejected with "user is not a member". Gated by a
      // localStorage key so we publish exactly one kind 9000 ever per
      // (relay, group, user) triple. Closed groups (`isOpen === false`)
      // skip this — those require an admin invite by design.
      if (
        myPubkey
        && group?.isOpen
        && !memberPubkeys.includes(myPubkey)
        && !admins.includes(myPubkey)
      ) {
        const key = `obelisk:claimed-member:${relay}:${groupId}:${myPubkey}`;
        let alreadyTried = false;
        try {
          alreadyTried = typeof localStorage !== 'undefined' && !!localStorage.getItem(key);
        } catch {}
        if (!alreadyTried) {
          try { localStorage?.setItem(key, '1'); } catch {}
          try { await nostrActions.putUser(groupId, myPubkey, []); } catch (err) {
            console.warn('[appshell] lazy member putUser failed', err);
          }
        }
      }
      await nostrActions.sendMessage(
        groupId,
        content,
        replyingTo ? { id: replyingTo.id, pubkey: replyingTo.pubkey } : null,
      );
      setDraft('');
      setReplyingTo(null);
    } catch (err) {
      console.error('send failed', err);
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-lc-border bg-lc-dark px-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xl text-lc-muted">#</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold text-lc-white">
                {group?.name ?? groupId.slice(0, 12)}
              </span>
              {isAdmin && (
                <span className="rounded-full bg-lc-green/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-lc-green">
                  Admin
                </span>
              )}
            </div>
            {group?.about && <div className="truncate text-xs text-lc-muted">{group.about}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-md p-2 text-lc-muted hover:bg-lc-card hover:text-lc-white"
              title="Channel settings"
              aria-label="Channel settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleMembers}
            className={
              'rounded-md p-2 hover:bg-lc-card ' +
              (showMembers ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white')
            }
            title={showMembers ? 'Hide member list' : 'Show member list'}
            aria-label={showMembers ? 'Hide member list' : 'Show member list'}
            aria-pressed={showMembers}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
          <CopyInviteLinkButton groupId={groupId} />
          <SearchBar
            serverName={group?.name ?? 'channel'}
            activeGroupId={groupId}
          />
        </div>
      </header>
      {/* Channel banner intentionally hidden — re-enable once we have a proper layout. */}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
      {(() => {
        const textBody = (
      <>
      <RelayAccessBanner />
      {!messagesVisible ? (
        <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="messages-gated-by-auth" />
      ) : (
      <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-lc-muted">
            <div className="max-w-md text-center">
              {group ? (
                <>
                  <div className="text-base font-medium text-lc-white">
                    Welcome to #{group.name ?? 'channel'}
                  </div>
                  <div className="mt-1">No messages yet — be the first.</div>
                </>
              ) : (
                <>
                  <div className="text-base font-medium text-lc-white">
                    Channel not visible on this relay
                  </div>
                  <div className="mt-1">
                    The link points to <span className="font-mono text-xs text-lc-muted">{groupId.slice(0, 16)}…</span>
                    , but this relay isn&apos;t exposing it to you. You may need to be added as a member, or switch to the relay that hosts it.
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped =
              prev && prev.pubkey === m.pubkey && m.createdAt - prev.createdAt < 300;
            return (
              <MessageRow
                key={m.id}
                msg={m}
                allMessages={messages}
                reactions={reactions[m.id] ?? []}
                zapTotal={zapTotals.get(m.id) ?? null}
                groupId={groupId}
                grouped={!!grouped}
                isAdmin={isAdmin}
                onReply={setReplyingTo}
              />
            );
          })
        )}
      </div>

      <form onSubmit={onSend} className="shrink-0 px-5 pt-3 pb-3">
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-t-md border border-b-0 border-lc-border bg-lc-card/60 px-3 py-1.5 text-xs text-lc-muted">
            <span className="truncate">
              Replying to <ReplyAuthorName pubkey={replyingTo.pubkey} />
              <span className="ml-2 truncate text-lc-muted">{replyingTo.content.slice(0, 80)}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-lc-muted hover:text-lc-white"
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        {sendError && (
          <p className="mb-2 break-words text-xs text-red-400">{sendError}</p>
        )}
        {activeSlashCommand && (
          <SlashCommandScaffold command={activeSlashCommand} content={draft} caret={caret} />
        )}
        {(() => {
          const pendingImages = extractUrls(draft).filter(isImageUrl).slice(0, 4);
          if (pendingImages.length === 0 && !uploadingMedia) return null;
          const removeUrl = (url: string) => {
            setDraft((d) =>
              d
                .split('\n')
                .filter((line) => line.trim() !== url)
                .join('\n')
                .replace(/\n{3,}/g, '\n\n'),
            );
          };
          return (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-lc-border bg-lc-card/50 p-2">
              {pendingImages.map((url) => (
                <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-lc-black">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeUrl(url)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-lc-white opacity-90 hover:bg-black"
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
              {uploadingMedia && (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-lc-border text-[10px] uppercase tracking-wider text-lc-muted">
                  …
                </div>
              )}
            </div>
          );
        })()}
        <div className="flex min-h-[3.5rem] items-center gap-2 rounded-xl border border-lc-border bg-lc-card px-4 focus-within:border-lc-green">
          <label
            className="cursor-pointer text-lc-muted hover:text-lc-white"
            title="Attach media"
            aria-label="Attach media"
          >
            {uploadingMedia ? (
              <span className="text-[10px] uppercase tracking-wider text-lc-muted">…</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.49" />
              </svg>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={uploadingMedia || sending}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void onPickFiles(files);
                e.target.value = '';
              }}
            />
          </label>
          <div className="relative flex-1">
            {slashQuery !== null && slashResults.length > 0 && (
              <SlashCommandAutocomplete
                commands={slashResults}
                selectedIndex={slashIndex}
                onSelect={insertSlashCommand}
                onClose={() => setSlashQuery(null)}
              />
            )}
            {mentionQuery !== null && filteredMembers.length > 0 && (
              <MentionAutocomplete
                members={filteredMembers}
                selectedIndex={mentionIndex}
                onSelect={applyMention}
                onHover={setMentionIndex}
                onClose={() => setMentionQuery(null)}
              />
            )}
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyDown={onMentionKeyDown}
              onSelect={(e) => {
                const t = e.currentTarget;
                detectMention(t.value, t.selectionStart ?? t.value.length);
              }}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items ?? []);
                const files: File[] = [];
                for (const it of items) {
                  if (it.kind === 'file') {
                    const f = it.getAsFile();
                    if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) {
                      files.push(f);
                    }
                  }
                }
                if (files.length > 0) {
                  e.preventDefault();
                  void onPickFiles(files);
                }
              }}
              placeholder={`Message #${group?.name ?? groupId.slice(0, 8)}`}
              disabled={sending}
              className="w-full bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !draft.trim() || uploadingMedia}
            className="text-xs font-semibold text-lc-green hover:text-lc-green/80 disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </form>
      </>
      )}
      </>
        );
        if (group?.kind === 'forum') {
          return (
            <ForumView
              groupId={groupId}
              channelName={group?.name ?? undefined}
              onSelectThread={onSelectGroup}
            />
          );
        }
        if (group?.kind === 'voice') {
          return (
            <VoiceRoom
              channelId={groupId}
              channelName={group?.name ?? undefined}
              isChatOpen={voiceChatOpen}
              onToggleChat={() => setVoiceChatOpen(!voiceChatOpen)}
              chatSlot={
                <aside
                  id="voice-chat-rail"
                  style={{ width: voiceChatWidth }}
                  className="relative flex flex-col min-h-0 shrink-0 my-0 rounded-xl border border-lc-border bg-lc-dark shadow-xl overflow-hidden"
                >
                  <div
                    onMouseDown={onResize}
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-lc-green/40 active:bg-lc-green/60 z-10"
                    title="Drag to resize"
                  />
                  <div className="h-12 px-4 border-b border-lc-border flex items-center justify-between shrink-0">
                    <span className="text-sm font-semibold text-lc-white">Chat</span>
                    <button
                      onClick={() => setVoiceChatOpen(false)}
                      className="text-lc-muted hover:text-lc-white"
                      title="Hide chat"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col min-h-0">{textBody}</div>
                </aside>
              }
            />
          );
        }
        return textBody;
      })()}
        </div>
        {showMembers && group?.kind === 'text' && <MembersPanel groupId={groupId} />}
      </div>

      {showSettings && group && (
        <ChannelSettingsModal group={group} onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

const QUICK_REACTIONS = ['🔥', '⚡', '😂', '🤔'];

function CopyInviteLinkButton({ groupId }: { groupId: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('c', groupId);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={onCopy}
      className={
        'rounded-md p-2 hover:bg-lc-card hover:text-lc-white ' +
        (copied ? 'text-lc-green' : 'text-lc-muted')
      }
      title={copied ? 'Link copied — only members of this relay can open it' : 'Copy invite link'}
      aria-label="Copy invite link"
    >
      {copied ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )}
    </button>
  );
}

function ReplyAuthorName({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  return <span className="font-semibold text-lc-white">{name}</span>;
}

function ReplyPreviewRow({
  parent,
  onJump,
}: {
  parent: JsMessage;
  onJump: () => void;
}) {
  const meta = useUserMetadata(parent.pubkey);
  const name = meta?.displayName || meta?.name || parent.pubkey.slice(0, 8);
  const preview = parent.content.replace(/\s+/g, ' ').slice(0, 120);
  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-1 flex max-w-full items-center gap-2 truncate text-xs text-lc-muted hover:text-lc-white"
      title="Jump to replied message"
    >
      <span className="text-lc-green">↩</span>
      <span className="font-semibold text-lc-white/80">{name}</span>
      <span className="truncate text-lc-muted">{preview}</span>
    </button>
  );
}

function MessageRow({
  msg,
  allMessages,
  reactions,
  zapTotal,
  groupId,
  grouped,
  isAdmin,
  onReply,
}: {
  msg: JsMessage;
  allMessages: ReadonlyArray<JsMessage>;
  reactions: ReadonlyArray<{ emoji: string }>;
  zapTotal: MessageZapTotal | null;
  groupId: string;
  grouped: boolean;
  isAdmin: boolean;
  onReply: (m: JsMessage) => void;
}) {
  const parent = msg.replyToId
    ? allMessages.find((x) => x.id === msg.replyToId) ?? null
    : null;
  const onJumpToParent = () => {
    if (!parent) return;
    const el = document.querySelector(`[data-msg-id="${parent.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-lc-green');
      setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), 1200);
    }
  };
  const meta = useUserMetadata(msg.pubkey);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelPinned, setPanelPinned] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const myPubkey = useMyPubkey();
  const myMutes = useMyMutes();
  const isMuted = myMutes.includes(msg.pubkey);
  const toggleMute = async () => {
    try {
      await nostrActions.setMuted(msg.pubkey, !isMuted);
    } catch (e) {
      useToastStore.getState().pushToast({
        title: 'No se pudo silenciar',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const closeAll = () => { setMenuOpen(false); setPanelPinned(false); setPickerOpen(false); };
  useEffect(() => {
    if (!menuOpen && !panelPinned && !pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeAll();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen, panelPinned, pickerOpen]);
  // Dedupe reactions by (pubkey, emoji) — each user can only count once per
  // emoji even if the relay re-delivered or the user double-tapped before the
  // first kind:7 round-tripped.
  const reactionsByEmoji = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of reactions as ReadonlyArray<{ emoji: string; pubkey: string }>) {
      let s = m.get(r.emoji);
      if (!s) { s = new Set(); m.set(r.emoji, s); }
      s.add(r.pubkey);
    }
    return m;
  }, [reactions]);
  const counts = useMemo(
    () => Array.from(reactionsByEmoji.entries())
      .map(([emoji, set]) => [emoji, set.size] as const)
      .sort((a, b) => b[1] - a[1]),
    [reactionsByEmoji],
  );
  const myReactedEmojis = useMemo(() => {
    if (!myPubkey) return new Set<string>();
    const out = new Set<string>();
    for (const [emoji, set] of reactionsByEmoji) if (set.has(myPubkey)) out.add(emoji);
    return out;
  }, [reactionsByEmoji, myPubkey]);
  const onReactionClick = (emoji: string) => {
    if (myReactedEmojis.has(emoji)) return; // already reacted — no-op until retraction is wired
    void nostrActions.sendReaction(msg.id, msg.pubkey, emoji, groupId);
  };
  const openZap = useMessageZapStore((s) => s.open);
  const onZapClick = () => {
    if (msg.pubkey === myPubkey) {
      useToastStore.getState().pushToast({ title: '⚠️ Cannot zap yourself', body: '' });
      return;
    }
    openZap({
      messageId: msg.id,
      recipientPubkey: msg.pubkey,
      recipientLud16: meta?.lud16 ?? null,
      displayName: meta?.displayName || meta?.name || msg.pubkey.slice(0, 8),
      groupId,
    });
  };
  const [anchor, setAnchor] = useState<{ x: number; y: number; placement?: 'top' | 'bottom' } | null>(null);
  const displayName = meta?.displayName || meta?.name || msg.pubkey.slice(0, 8);
  const openProfile = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ x: r.right + 8, y: r.top, placement: r.top > window.innerHeight / 2 ? 'top' : 'bottom' });
  };

  return (
    <div data-msg-id={msg.id} className={'group relative flex gap-3 rounded px-2 py-0.5 hover:bg-lc-card/40 ' + (grouped ? 'mt-0' : 'mt-3')}>
      <div className="w-10 shrink-0">
        {!grouped && (
          <button onClick={openProfile} className="rounded-full transition hover:opacity-80">
            <Avatar pubkey={msg.pubkey} size={10} picture={meta?.picture ?? null} />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button onClick={openProfile} className="text-sm font-bold text-lc-white hover:underline">{displayName}</button>
            <span className="text-[10px] text-lc-muted">
              {new Date(msg.createdAt * 1000).toLocaleString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        )}
        {parent && <ReplyPreviewRow parent={parent} onJump={onJumpToParent} />}
        {msg.replyToId && !parent && (
          <div className="mb-1 text-xs italic text-lc-muted">↩ replying to a message</div>
        )}
        <div
          className="break-words text-sm text-lc-white cursor-pointer"
          onClick={(e) => {
            // Don't hijack clicks on links/buttons inside the message content.
            const t = e.target as HTMLElement;
            if (t.closest('a, button, input, textarea, [data-no-msg-menu]')) return;
            setPanelPinned((v) => !v);
          }}
        >
          <MessageContent content={msg.content} messageId={msg.id} channelId={groupId} />
        </div>
        {(counts.length > 0 || (zapTotal && zapTotal.totalSats > 0)) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {zapTotal && zapTotal.totalSats > 0 && (
              <button
                onClick={onZapClick}
                disabled={msg.pubkey === myPubkey}
                title={`${zapTotal.count} zap${zapTotal.count === 1 ? '' : 's'} from ${zapTotal.zappers.size} ${zapTotal.zappers.size === 1 ? 'person' : 'people'}`}
                className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200 hover:border-yellow-500 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" aria-hidden="true">
                  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                </svg>
                {zapTotal.totalSats.toLocaleString()}
              </button>
            )}
            {counts.map(([emoji, n]) => {
              const mine = myReactedEmojis.has(emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => onReactionClick(emoji)}
                  disabled={mine}
                  title={mine ? 'Ya reaccionaste con este emoji' : undefined}
                  className={
                    'rounded-full border px-2 py-0.5 text-xs text-lc-white ' +
                    (mine
                      ? 'border-lc-green/60 bg-lc-green/10 cursor-default'
                      : 'border-lc-border bg-lc-card hover:border-lc-green')
                  }
                >
                  {emoji} {n}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div ref={menuRef} className="absolute right-3 top-0 flex items-start gap-1" data-no-msg-menu>
        {/* Frequent emoji panel — visible on hover, click to pin */}
        <div
          className={
            'rounded-md border border-lc-border bg-lc-dark p-0.5 shadow-md ' +
            (panelPinned || pickerOpen ? 'flex' : 'hidden group-hover:flex')
          }
        >
          {QUICK_REACTIONS.map((e) => {
            const mine = myReactedEmojis.has(e);
            return (
              <button
                key={e}
                onClick={() => { onReactionClick(e); closeAll(); }}
                disabled={mine}
                className="rounded px-1.5 py-0.5 text-sm hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
                title={mine ? 'Already reacted' : `React ${e}`}
              >
                {e}
              </button>
            );
          })}
          <button
            onClick={() => { setPickerOpen((v) => !v); setPanelPinned(true); }}
            className="rounded px-1.5 py-0.5 text-sm text-lc-muted hover:bg-lc-card hover:text-lc-white"
            title="More emojis…"
            aria-label="Open emoji picker"
          >
            ➕
          </button>
        </div>
        {/* ⋯ menu trigger */}
        <div
          className={
            'rounded-md border border-lc-border bg-lc-dark p-0.5 shadow-md ' +
            (menuOpen || panelPinned ? 'flex' : 'hidden group-hover:flex')
          }
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setPickerOpen(false); }}
            className="rounded px-1.5 py-0.5 text-sm text-lc-muted hover:bg-lc-card hover:text-lc-white"
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
        </div>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-7 z-20 w-48 rounded-md border border-lc-border bg-lc-dark p-1 shadow-2xl"
          >
            <button
              role="menuitem"
              onClick={() => { onReply(msg); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-lc-white hover:bg-lc-card"
            >
              <span className="w-4 text-center">↩</span> Reply
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); setPickerOpen(true); setPanelPinned(true); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-lc-white hover:bg-lc-card"
            >
              <span className="w-4 text-center">😊</span> React
            </button>
            <button
              role="menuitem"
              onClick={() => { onZapClick(); setMenuOpen(false); }}
              disabled={msg.pubkey === myPubkey}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-yellow-400 hover:bg-lc-card disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true" className="ml-0.5">
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
              Zap
            </button>
            <button
              role="menuitem"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.search = '';
                  url.searchParams.set('c', groupId);
                  url.searchParams.set('m', msg.id);
                  navigator.clipboard.writeText(url.toString());
                  useToastStore.getState().pushToast({ title: '🔗 Link copied', body: '' });
                }
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-lc-white hover:bg-lc-card"
            >
              <span className="w-4 text-center">🔗</span> Copy link
            </button>
            <button
              role="menuitem"
              onClick={() => { void toggleMute(); setMenuOpen(false); }}
              disabled={msg.pubkey === myPubkey}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-400 hover:bg-lc-card disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className="w-4 text-center">🔕</span>
              {isMuted ? 'Unmute user' : 'Mute user'}
            </button>
            {isAdmin && (
              <button
                role="menuitem"
                onClick={() => {
                  if (confirm('Delete this message?')) nostrActions.deleteGroupEvent(groupId, msg.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-400 hover:bg-lc-card"
              >
                <span className="w-4 text-center">🗑</span> Delete (admin)
              </button>
            )}
          </div>
        )}
        {pickerOpen && (
          <EmojiPicker
            disabledEmojis={myReactedEmojis}
            onPick={(e) => { onReactionClick(e); closeAll(); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
      {anchor && (
        <UserPanel
          pubkey={msg.pubkey}
          isMe={msg.pubkey === myPubkey}
          onClose={() => setAnchor(null)}
          onLogout={msg.pubkey === myPubkey ? () => { nostrActions.logout(); setAnchor(null); } : undefined}
          anchor={anchor}
        />
      )}
    </div>
  );
}

// -- Emoji picker -------------------------------------------------------

function EmojiPicker({
  onPick,
  onClose,
  disabledEmojis,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  disabledEmojis: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const q = normalizeEmojiKeyword(query.trim());
  const filtered = useMemo(() => {
    if (!q) return null;
    return SEARCHABLE_EMOJI.filter((e) => e.haystack.includes(q)).slice(0, 64);
  }, [q]);
  return (
    <div
      role="dialog"
      aria-label="Emoji picker"
      className="absolute right-0 top-7 z-30 w-72 rounded-md border border-lc-border bg-lc-dark p-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="flex-1 rounded border border-lc-border bg-lc-black px-2 py-1 text-xs text-lc-white placeholder:text-lc-muted focus:border-lc-green focus:outline-none"
        />
        <button
          onClick={onClose}
          className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
          aria-label="Close emoji picker"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered ? (
          <div className="grid grid-cols-8 gap-0.5">
            {filtered.length === 0 && (
              <div className="col-span-8 py-4 text-center text-xs text-lc-muted">No matches</div>
            )}
            {filtered.map((e) => {
              const mine = disabledEmojis.has(e.char);
              return (
                <button
                  key={e.char}
                  onClick={() => onPick(e.char)}
                  disabled={mine}
                  className="rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
                  title={mine ? 'Already reacted' : e.keywords[0]}
                >
                  {e.char}
                </button>
              );
            })}
          </div>
        ) : (
          EMOJI_CATEGORY_NAMES.map((cat) => (
            <div key={cat} className="mb-2">
              <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">{cat}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI_CATEGORIES[cat].map((e) => {
                  const mine = disabledEmojis.has(e.char);
                  return (
                    <button
                      key={e.char}
                      onClick={() => onPick(e.char)}
                      disabled={mine}
                      className="rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
                      title={mine ? 'Already reacted' : e.keywords[0]}
                    >
                      {e.char}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// -- Members panel ------------------------------------------------------

function MembersPanel({ groupId }: { groupId: string }) {
  return (
    <>
      <ChatStoreMembersAdapter groupId={groupId} />
      <MemberList profileCache={EMPTY_PROFILE_CACHE} />
      <ProfilePopupBridge />
    </>
  );
}

const EMPTY_PROFILE_CACHE = new Map<string, { name?: string; picture?: string }>();

function ChatStoreMembersAdapter({ groupId }: { groupId: string }) {
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const setMemberList = useChatStore((s) => s.setMemberList);
  const setOnlinePubkeys = useChatStore((s) => s.setOnlinePubkeys);

  const allPubkeys = useMemo(() => {
    const set = new Set<string>([...admins, ...members]);
    return Array.from(set);
  }, [admins, members]);

  const adminSet = useMemo(() => new Set(admins), [admins]);

  // Seed/refresh the list when admin or member sets change. Preserve any
  // metadata (displayName/picture/nip05/customRoles) already attached to a
  // row — without this, every relay-driven update to admins/members (e.g.
  // a fresh 39001/39002 after NIP-42 AUTH) wipes every row back to
  // `pubkey.slice(0,10)` with no picture, and `MemberMetaSync` only re-runs
  // when `meta` itself changes, so the cached metadata never re-applies and
  // names/pictures vanish until a manual refresh.
  useEffect(() => {
    const prev = useChatStore.getState().memberList;
    const prevByPk = new Map(prev.map((m) => [m.pubkey, m]));
    const list: MemberInfo[] = allPubkeys.map((pubkey) => {
      const role = adminSet.has(pubkey) ? 'admin' : 'member';
      const existing = prevByPk.get(pubkey);
      if (existing) return { ...existing, role };
      return { pubkey, displayName: pubkey.slice(0, 10), role };
    });
    setMemberList(list);
    setOnlinePubkeys(allPubkeys);
  }, [allPubkeys, adminSet, setMemberList, setOnlinePubkeys]);

  return (
    <>
      {allPubkeys.map((pk) => (
        <MemberMetaSync key={pk} pubkey={pk} />
      ))}
    </>
  );
}

function MemberMetaSync({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  useEffect(() => {
    if (!meta) return;
    useChatStore.setState((state) => {
      const idx = state.memberList.findIndex((m) => m.pubkey === pubkey);
      if (idx === -1) return state;
      const next = [...state.memberList];
      next[idx] = {
        ...next[idx],
        displayName: meta.displayName || meta.name || next[idx].displayName,
        picture: meta.picture ?? next[idx].picture,
        nip05: meta.nip05 ?? next[idx].nip05,
      };
      return { memberList: next } as Partial<typeof state> as typeof state;
    });
  }, [pubkey, meta]);
  return null;
}

function ProfilePopupBridge() {
  const popupPubkey = useChatStore((s) => s.profilePopupPubkey);
  const closePopup = useChatStore((s) => s.closeProfilePopup);
  const myPubkey = useMyPubkey();
  if (!popupPubkey) return null;
  return (
    <UserPanel
      pubkey={popupPubkey}
      isMe={popupPubkey === myPubkey}
      onClose={closePopup}
      onLogout={popupPubkey === myPubkey ? () => { nostrActions.logout(); closePopup(); } : undefined}
    />
  );
}

function MemberRow({ pubkey, isAdmin }: { pubkey: string; isAdmin: boolean }) {
  const meta = useUserMetadata(pubkey);
  const myPubkey = useMyPubkey();
  const [anchor, setAnchor] = useState<{ x: number; y: number; placement?: 'top' | 'bottom' } | null>(null);
  return (
    <>
      <button
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAnchor({ x: r.right - 340, y: r.top, placement: r.top > window.innerHeight / 2 ? 'top' : 'bottom' });
        }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-lc-card"
        title={pubkey}
      >
        <Avatar pubkey={pubkey} size={7} picture={meta?.picture ?? null} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm text-lc-white">
            <span className="truncate">{meta?.displayName || meta?.name || pubkey.slice(0, 10)}</span>
            {isAdmin && <span title="Admin" className="text-xs">👑</span>}
          </div>
          {meta?.nip05 && <div className="truncate text-[10px] text-lc-muted">{meta.nip05}</div>}
        </div>
      </button>
      {anchor && (
        <UserPanel
          pubkey={pubkey}
          isMe={pubkey === myPubkey}
          onClose={() => setAnchor(null)}
          onLogout={pubkey === myPubkey ? () => { nostrActions.logout(); setAnchor(null); } : undefined}
          anchor={anchor}
        />
      )}
    </>
  );
}

// -- Channel settings (admin) -------------------------------------------

function ChannelSettingsModal({ group, onClose }: { group: JsGroup; onClose: () => void }) {
  const [name, setName] = useState(group.name ?? '');
  const [about, setAbout] = useState(group.about ?? '');
  const [picture, setPicture] = useState(group.picture ?? '');
  const [banner, setBanner] = useState(group.banner ?? '');
  const [isPublic, setIsPublic] = useState(group.isPublic);
  const [isOpen, setIsOpen] = useState(group.isOpen);
  const [channelKind, setChannelKind] = useState<'text' | 'voice' | 'forum'>(group.kind);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<null | 'icon' | 'banner'>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = async (file: File, kind: 'icon' | 'banner') => {
    setUploading(kind);
    setUploadError(null);
    try {
      const { uploadToBlossom } = await import('@/lib/blossom');
      const url = await uploadToBlossom(file);
      if (kind === 'icon') setPicture(url);
      else setBanner(url);
    } catch (err) {
      setUploadError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const [newMember, setNewMember] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const members = useMembers(group.id);
  const admins = useAdmins(group.id);
  const adminSet = useMemo(() => new Set(admins), [admins]);

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setMetaErr(null);
    try {
      await nostrActions.editGroupMetadata({
        groupId: group.id,
        name,
        about,
        picture: picture || undefined,
        banner: banner || undefined,
        isPublic,
        isOpen,
        kind: channelKind,
      });
      onClose();
    } catch (err) {
      setMetaErr((err as Error).message);
    } finally {
      setSavingMeta(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberErr(null);
    let hex = newMember.trim();
    if (!hex) return;
    if (hex.startsWith('npub1')) {
      try {
        const { nip19 } = await import('nostr-tools');
        const decoded = nip19.decode(hex);
        if (decoded.type !== 'npub') throw new Error('Not an npub');
        hex = decoded.data as string;
      } catch (err) {
        setMemberErr((err as Error).message);
        return;
      }
    }
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      setMemberErr('Provide an npub or 64-char hex pubkey');
      return;
    }
    setMemberBusy(true);
    try {
      await nostrActions.putUser(group.id, hex, makeAdmin ? ['admin'] : []);
      setNewMember('');
      setMakeAdmin(false);
    } catch (err) {
      setMemberErr((err as Error).message);
    } finally {
      setMemberBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="lc-card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-lc-dark"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-lc-border px-5 py-3">
          <div className="text-base font-bold text-lc-white">Channel settings · #{group.name ?? group.id.slice(0, 8)}</div>
          <button onClick={onClose} className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={saveMeta} id="channel-meta-form" className="space-y-7 p-5">
            {/* Basics --------------------------------------------------- */}
            <section className="space-y-3">
              <SectionHeader title="Basics" />
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="About">
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={2}
                  placeholder="What's this channel about?"
                  className={inputClasses}
                />
              </Field>
            </section>

            {/* Appearance ----------------------------------------------- */}
            <section className="space-y-4">
              <SectionHeader title="Appearance" />
              <ImageUploadRow
                label="Icon"
                value={picture}
                onChange={setPicture}
                onUpload={(f) => uploadImage(f, 'icon')}
                uploading={uploading === 'icon'}
                previewClass="w-14 h-14 rounded-xl"
                placeholder="https://… or upload"
              />
              <ImageUploadRow
                label="Banner"
                value={banner}
                onChange={setBanner}
                onUpload={(f) => uploadImage(f, 'banner')}
                uploading={uploading === 'banner'}
                previewClass="w-28 h-14 rounded-lg"
                placeholder="https://… or upload (gif / png / jpg)"
              />
              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
            </section>

            {/* Access --------------------------------------------------- */}
            <section className="space-y-3">
              <SectionHeader title="Access" hint="Who can read and join" />
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleCard
                  active={isPublic}
                  onClick={() => setIsPublic(!isPublic)}
                  icon="🌐"
                  title="Public"
                  subtitle={isPublic ? 'Readable without joining' : 'Members only can read'}
                />
                <ToggleCard
                  active={isOpen}
                  onClick={() => setIsOpen(!isOpen)}
                  icon={isOpen ? '🟢' : '🔒'}
                  title="Open"
                  subtitle={isOpen ? 'Anyone can join' : 'Invite-only'}
                />
              </div>
              {isPublic && isOpen && (
                <div className="flex items-start gap-2 rounded-lg border border-lc-green/30 bg-lc-green/5 px-3 py-2 text-xs text-lc-white/90">
                  <span className="text-base leading-none">✨</span>
                  <div>
                    <div className="font-semibold text-lc-green">Relay-whitelisted users have full access</div>
                    <div className="mt-0.5 text-lc-muted">
                      With <b>Public + Open</b>, anyone the relay already accepts can read and post here — no need to add them as members manually. The relay&apos;s whitelist is the only gate.
                    </div>
                  </div>
                </div>
              )}
              {!isPublic && !isOpen && (
                <p className="text-[11px] text-lc-muted">
                  Strictest mode: only members listed below can read or post.
                </p>
              )}
            </section>

            {/* Channel type --------------------------------------------- */}
            <section className="space-y-3">
              <SectionHeader title="Channel type" />
              <div className="grid gap-2 sm:grid-cols-3">
                <ToggleCard
                  active={channelKind === 'text'}
                  onClick={() => setChannelKind('text')}
                  icon="💬"
                  title="Text"
                  subtitle="Messages, threads, reactions"
                />
                <ToggleCard
                  active={channelKind === 'voice'}
                  onClick={() => setChannelKind('voice')}
                  icon="🎙️"
                  title="Voice / Video"
                  subtitle="P2P call, up to 4 people"
                />
                <ToggleCard
                  active={channelKind === 'forum'}
                  onClick={() => setChannelKind('forum')}
                  icon="📋"
                  title="Forum"
                  subtitle="Threaded posts with replies"
                />
              </div>
              {channelKind === 'voice' && (
                <p className="text-[11px] text-lc-muted">
                  Adds a <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice&quot;]</code> tag. Members open{' '}
                  <code className="text-lc-white/80">/voice/{group.id.slice(0, 8)}…</code> to join.
                </p>
              )}
              {channelKind === 'forum' && (
                <p className="text-[11px] text-lc-muted">
                  Adds a <code className="text-lc-white/80">[&quot;t&quot;,&quot;forum&quot;]</code> tag. The
                  channel renders as a list of threaded posts (NIP-29 kind 11) with replies (kind 12)
                  instead of a chat stream.
                </p>
              )}
            </section>

            {metaErr && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{metaErr}</div>
            )}
          </form>

          <div className="border-t border-lc-border" />

          <section className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <SectionHeader title="Members" hint="NIP-29 kind 9000 / 9001" />
              <span className="rounded-full bg-lc-card px-2 py-0.5 text-[11px] font-semibold text-lc-muted">
                {members.length}
              </span>
            </div>
            <form onSubmit={addMember} className="flex flex-wrap items-center gap-2">
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="npub1… or hex pubkey"
                spellCheck={false}
                className={inputClasses + ' flex-1 min-w-[12rem]'}
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-lc-border bg-lc-black px-2.5 py-1.5 text-xs text-lc-muted">
                <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
                admin
              </label>
              <button
                type="submit"
                disabled={memberBusy || !newMember.trim()}
                className="shrink-0 rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
              >
                {memberBusy ? '…' : 'Add'}
              </button>
            </form>
            {memberErr && <div className="text-sm text-red-400">{memberErr}</div>}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {members.map((pk) => (
                <ManageMemberRow key={pk} groupId={group.id} pubkey={pk} isAdmin={adminSet.has(pk)} />
              ))}
              {members.length === 0 && (
                <div className="rounded-lg border border-dashed border-lc-border px-3 py-4 text-center text-xs text-lc-muted">
                  No members yet. {isPublic && isOpen
                    ? 'Not required — relay whitelist controls access.'
                    : 'Add at least one to grant access.'}
                </div>
              )}
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-lc-border bg-lc-dark px-5 py-3">
          <div className="text-[11px] text-lc-muted">Changes publish as NIP-29 kind 9002.</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="channel-meta-form"
              disabled={savingMeta}
              className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
            >
              {savingMeta ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-bold text-lc-white">{title}</h3>
      {hint && <span className="text-[11px] text-lc-muted">{hint}</span>}
    </div>
  );
}

function ToggleCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ' +
        (active
          ? 'border-lc-green bg-lc-green/10 text-lc-white'
          : 'border-lc-border bg-lc-black hover:border-lc-muted text-lc-white/80')
      }
    >
      <div className="text-xl leading-none">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-lc-muted">{subtitle}</div>
      </div>
      <div
        className={
          'mt-0.5 h-4 w-4 shrink-0 rounded-full border ' +
          (active ? 'border-lc-green bg-lc-green' : 'border-lc-border')
        }
      />
    </button>
  );
}

function ImageUploadRow({
  label,
  value,
  onChange,
  onUpload,
  uploading,
  previewClass,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onUpload: (f: File) => void;
  uploading: boolean;
  previewClass: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={`${label} preview`}
            className={`${previewClass} object-cover bg-lc-black border border-lc-border`}
          />
        ) : (
          <div className={`${previewClass} bg-lc-black border border-lc-border`} />
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
        />
        <label className="lc-pill lc-pill-secondary cursor-pointer whitespace-nowrap text-xs">
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

function ManageMemberRow({ groupId, pubkey, isAdmin }: { groupId: string; pubkey: string; isAdmin: boolean }) {
  const meta = useUserMetadata(pubkey);
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-lc-card">
      <Avatar pubkey={pubkey} size={7} picture={meta?.picture ?? null} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-lc-white">
          {meta?.displayName || meta?.name || pubkey.slice(0, 10)}
          {isAdmin && <span className="ml-1 text-xs">👑</span>}
        </div>
        <div className="truncate font-mono text-[10px] text-lc-muted">{pubkey.slice(0, 32)}…</div>
      </div>
      {isAdmin && (
        <button
          onClick={() => {
            if (confirm(`Demote ${meta?.name || pubkey.slice(0, 12)} to plain member?`)) {
              nostrActions.removePermission(groupId, pubkey, ['admin']);
            }
          }}
          className="rounded px-2 py-0.5 text-xs text-lc-muted hover:bg-lc-dark hover:text-lc-white"
          title="Strip admin role; keep them in the channel as a regular member."
        >
          Demote
        </button>
      )}
      <button
        onClick={() => {
          if (confirm(`Remove ${meta?.name || pubkey.slice(0, 12)} from channel?`)) {
            nostrActions.removeUser(groupId, pubkey);
          }
        }}
        className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-lc-dark"
      >
        Remove
      </button>
    </div>
  );
}

const inputClasses =
  'w-full rounded border border-lc-border bg-lc-black px-2 py-1.5 text-sm text-lc-white outline-none focus:border-lc-green';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium text-lc-muted">{label}</div>
      {children}
    </label>
  );
}

// -- DMs ----------------------------------------------------------------

function DMPanel({ peer }: { peer: string | null; onPickPeer: (p: string) => void }) {
  const dms = useDirectMessages();
  const meta = useUserMetadata(peer);
  const thread = peer ? dms[peer] ?? [] : [];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, peer]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!peer) return;
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    try {
      await nostrActions.sendDirectMessage(peer, content);
      setDraft('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!peer) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-lc-muted">
        Pick or start a DM conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-lc-border bg-lc-dark px-5 py-3">
        <Avatar pubkey={peer} size={9} picture={meta?.picture ?? null} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-lc-white">
            {meta?.displayName || meta?.name || peer.slice(0, 16) + '…'}
          </div>
          <div className="truncate font-mono text-[10px] text-lc-muted">{peer}</div>
        </div>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {thread.length === 0 ? (
          <div className="text-sm text-lc-muted">No messages yet. Send the first one (NIP-04 encrypted).</div>
        ) : (
          thread.map((m) => (
            <div
              key={m.id}
              className={
                'mb-2 max-w-md rounded-2xl px-4 py-2 text-sm shadow-sm ' +
                (m.outgoing
                  ? 'ml-auto bg-lc-green text-lc-black'
                  : 'bg-lc-card text-lc-white')
              }
            >
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              <div className={'mt-1 text-[10px] ' + (m.outgoing ? 'text-black/60' : 'text-lc-muted')}>
                {new Date(m.createdAt * 1000).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={onSend} className="shrink-0 px-5 pt-3 pb-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex min-h-[3.5rem] items-center gap-2 rounded-xl border border-lc-border bg-lc-card px-4 focus-within:border-lc-green">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Encrypted message (NIP-04)"
            disabled={sending}
            className="flex-1 bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="text-xs font-semibold text-lc-green disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

// -- Helpers ------------------------------------------------------------

function Avatar({ pubkey, size, picture }: { pubkey: string; size: number; picture: string | null }) {
  const px = `${size * 4}px`;
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt=""
        style={{ width: px, height: px }}
        className="rounded-full bg-lc-card object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  const hue = parseInt(pubkey.slice(0, 6), 16) % 360;
  return (
    <div
      style={{ width: px, height: px, background: `hsl(${hue} 60% 30%)` }}
      className="flex items-center justify-center rounded-full font-mono text-[10px] font-bold text-lc-white"
    >
      {pubkey.slice(0, 2).toUpperCase()}
    </div>
  );
}

function RelayAccessModal() {
  const relay = useCurrentRelayUrl();
  const access = useRelayAccess();
  const loginMethod = useMyLoginMethod();
  const isLoggedIn = useIsLoggedIn();
  // Track which (relay, state) tuple the user has dismissed so the modal
  // doesn't keep popping back. A real state change (e.g. ok -> restricted
  // again on a new relay, or auth-required after restricted) re-arms it.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const key = relay && (access === 'restricted' || access === 'auth-required')
    ? `${relay}|${access}`
    : null;
  if (!isLoggedIn) return null;
  if (!key) return null;
  if (dismissed === key) return null;

  const host = shortHost(relay);
  const isAuth = access === 'auth-required';
  const title = isAuth ? `Not authenticated to ${host}` : `Not whitelisted on ${host}`;
  const body = isAuth
    ? loginMethod === 'bunker'
      ? 'Approve the signing request in your bunker app to complete NIP-42 AUTH.'
      : loginMethod === 'nip07'
        ? 'Approve the signing request in your Nostr extension to complete NIP-42 AUTH.'
        : 'NIP-42 AUTH did not complete. Try reloading or switching login methods.'
    : 'This relay accepted your signature but won’t serve or accept events from your pubkey. Ask the operator to add you to its allowlist, or switch relays.';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={() => setDismissed(key)}
    >
      <div
        className={
          'max-w-md rounded-xl border bg-lc-card p-6 shadow-2xl ' +
          (isAuth ? 'border-yellow-500/50' : 'border-red-500/50')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className={'text-xl font-bold ' + (isAuth ? 'text-yellow-200' : 'text-red-300')}>
          {title}
        </div>
        <div className="mt-3 text-sm text-lc-white/90">{body}</div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setDismissed(key)}
            className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function RelayAccessBanner({ compact = false }: { compact?: boolean } = {}) {
  const relay = useCurrentRelayUrl();
  const access = useRelayAccess();
  const loginMethod = useMyLoginMethod();
  const isLoggedIn = useIsLoggedIn();
  if (!relay) return null;
  if (access === 'ok') return null;

  const host = shortHost(relay);
  const wrapperBase = compact
    ? 'rounded-xl border p-4'
    : 'mx-5 mt-4 rounded-xl border p-5';
  const titleSize = compact ? 'text-base' : 'text-lg';

  if (access === 'unknown') {
    // Pre-AUTH "no signal yet" state. Hidden when logged out — LoginModal
    // owns that surface and a duplicate "Connecting" message would just
    // crowd it.
    if (!isLoggedIn) return null;
    return (
      <div
        className={`${wrapperBase} border-lc-border bg-lc-card/60`}
        data-testid="relay-access-banner"
        data-state="unknown"
      >
        <div className={`${titleSize} font-semibold flex items-center gap-2 text-lc-white`}>
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-lc-green/30 border-t-lc-green"
            aria-hidden
          />
          Connecting to {host}…
        </div>
        <div className="mt-1 text-sm text-lc-muted">
          Waiting for the relay to respond. Channels stay hidden until the relay confirms read access.
        </div>
      </div>
    );
  }

  if (access === 'authenticating') {
    const reason =
      loginMethod === 'bunker'
        ? 'Approve the signing request in your bunker app to complete NIP-42 AUTH.'
        : loginMethod === 'nip07'
          ? 'Approve the signing request in your Nostr extension to complete NIP-42 AUTH.'
          : 'Signing the relay AUTH challenge…';
    return (
      <div
        className={`${wrapperBase} border-yellow-500/40 bg-yellow-500/10`}
        data-testid="relay-access-banner"
        data-state="authenticating"
      >
        <div className={`${titleSize} font-semibold flex items-center gap-2 text-yellow-200`}>
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-300/30 border-t-yellow-200"
            aria-hidden
          />
          Authenticating with {host}…
        </div>
        <div className="mt-1 text-sm text-yellow-100/80">{reason}</div>
      </div>
    );
  }

  if (access === 'auth-required') {
    const reason = !isLoggedIn
      ? 'Log in with a Nostr key — this relay only serves authenticated readers.'
      : loginMethod === 'bunker'
        ? 'Approve the signing request in your bunker app to complete NIP-42 AUTH.'
        : loginMethod === 'nip07'
          ? 'Approve the signing request in your Nostr extension to complete NIP-42 AUTH.'
          : 'NIP-42 AUTH did not complete. Try reloading or switching login methods.';
    return (
      <div
        className={`${wrapperBase} border-yellow-500/40 bg-yellow-500/10`}
        data-testid="relay-access-banner"
        data-state="auth-required"
      >
        <div className={`${titleSize} font-semibold text-yellow-200`}>
          Not authenticated to {host}
        </div>
        <div className="mt-1 text-sm text-yellow-100/80">{reason}</div>
      </div>
    );
  }
  // 'restricted' | 'error'
  return (
    <div
      className={`${wrapperBase} border-red-500/40 bg-red-500/10`}
      data-testid="relay-access-banner"
      data-state={access}
    >
      <div className={`${titleSize} font-semibold text-red-200`}>
        {access === 'restricted' ? `Not whitelisted on ${host}` : `Relay error on ${host}`}
      </div>
      <div className="mt-1 text-sm text-red-100/80">
        {access === 'restricted'
          ? 'This relay accepted your signature but won’t serve or accept events from your pubkey. Ask the operator to add you to its allowlist, or switch relays.'
          : 'The relay rejected the request. Try reloading or switching relays.'}
      </div>
    </div>
  );
}

function EmptyState() {
  const relay = useCurrentRelayUrl();
  const access = useRelayAccess(relay || null);
  // If the relay hasn't confirmed access we surface the same banner the
  // sidebar shows, instead of "Pick a channel or DM" — the sidebar has no
  // channels to pick yet, so that prompt would just confuse.
  if (access !== 'ok') {
    return (
      <div className="flex h-full items-center justify-center px-5">
        <div className="w-full max-w-md">
          <RelayAccessBanner compact />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-lc-muted">
      <div className="text-center">
        <div className="text-lg font-medium text-lc-white">Pick a channel or DM</div>
        <div className="mt-1 text-sm">Choose from the sidebar — or hit + to create a new channel.</div>
      </div>
    </div>
  );
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// silence unused-import warning when JsUserMetadata is referenced indirectly
export type { JsUserMetadata };
