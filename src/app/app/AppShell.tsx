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
  useDirectMessages,
  useAdmins,
  useMembers,
  type JsGroup,
  type JsMessage,
  type JsUserMetadata,
} from '@/lib/nostr-bridge';
import { faviconFor, fetchRelayInfo } from '@/lib/relay-info';
import ServerRail from './ServerRail';
import DMList from './DMList';
import LoginModal from './LoginModal';
import UserPanel from './UserPanel';
import SearchBar from './SearchBar';

type View =
  | { kind: 'group'; groupId: string }
  | { kind: 'dm'; peer: string | null }
  | { kind: 'empty' };

const SIDEBAR_KEY = 'obeliskord/sidebar-width';
const MEMBERS_KEY = 'obeliskord/members-width';
const SHOW_MEMBERS_KEY = 'obeliskord/show-members';

export default function AppShell() {
  const isLoggedIn = useIsLoggedIn();
  const conn = useConnectionState();
  const relay = useCurrentRelayUrl();
  const [view, setView] = useState<View>({ kind: 'empty' });

  useEffect(() => {
    if (view.kind === 'group') nostrActions.setActiveGroup(view.groupId);
    else nostrActions.setActiveGroup(null);
  }, [view]);

  const [showMembers, setShowMembers] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(SHOW_MEMBERS_KEY);
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_MEMBERS_KEY, showMembers ? '1' : '0');
  }, [showMembers]);

  if (!isLoggedIn) return <LoginModal />;

  const railMode: { kind: 'dm' } | { kind: 'relay'; url: string } =
    view.kind === 'dm' ? { kind: 'dm' } : { kind: 'relay', url: relay };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-lc-black text-lc-white">
      <RelayTopBar relay={relay} />
      <div className="flex flex-1 overflow-hidden">
        <ServerRail
          mode={railMode}
          onPickDM={() => setView({ kind: 'dm', peer: null })}
          onPickRelay={async (url) => {
            if (url !== relay) await nostrActions.switchRelay(url);
            setView({ kind: 'empty' });
          }}
        />
        <ResizablePane storageKey={SIDEBAR_KEY} defaultWidth={264} min={200} max={500}>
          {view.kind === 'dm' ? (
            <DMList
              activePeer={view.peer}
              onPick={(p) => setView({ kind: 'dm', peer: p })}
            />
          ) : (
            <Sidebar relay={relay} conn={conn} view={view} setView={setView} />
          )}
        </ResizablePane>
        <main className="flex flex-1 flex-col overflow-hidden border border-lc-border bg-lc-dark my-2 mr-2 ml-1 rounded-xl shadow-xl">
          {view.kind === 'group' ? (
            <ChatLayout
              groupId={view.groupId}
              showMembers={showMembers}
              onToggleMembers={() => setShowMembers((v) => !v)}
            />
          ) : view.kind === 'dm' ? (
            <DMPanel peer={view.peer} onPickPeer={(p) => setView({ kind: 'dm', peer: p })} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function RelayTopBar({ relay }: { relay: string }) {
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
      className="h-10 shrink-0 border-b border-lc-border bg-lc-black px-3"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <a
        href="/"
        title="Back to home"
        aria-label="Back to home"
        className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-lc-muted hover:text-lc-green transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span className="text-xs font-medium">Home</span>
      </a>
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
}: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  side?: 'right' | 'left';
  children: React.ReactNode;
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
  }, [storageKey, width]);

  const handle = (
    <div
      onMouseDown={onMouseDown}
      className="group/handle relative w-1 cursor-col-resize bg-transparent hover:bg-lc-green/40 active:bg-lc-green/60"
      title="Drag to resize"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );

  return (
    <>
      {side === 'left' && handle}
      <div
        style={{ width }}
        className="flex shrink-0 flex-col overflow-hidden border border-lc-border bg-lc-dark my-2 mx-1 rounded-xl shadow-xl"
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

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-lc-border px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-lc-white">{shortHost(relay)}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-lc-muted">
            <span
              className={
                'inline-block h-1.5 w-1.5 rounded-full ' +
                (conn === 'Connected' ? 'bg-lc-green' : conn === 'Connecting' ? 'bg-yellow-500' : 'bg-red-500')
              }
            />
            {conn}
          </div>
        </div>
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
        <span>Channels · {groups.length}</span>
        <CreateGroupButton onCreated={(id) => setView({ kind: 'group', groupId: id })} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 && (
          <div className="px-2 py-3 text-xs text-lc-muted">Discovering channels… (kind 39000)</div>
        )}
        {roots.map((g) => (
          <GroupNode
            key={g.id}
            group={g}
            depth={0}
            childrenByParent={childrenByParent}
            groupsById={groupsById}
            view={view}
            onSelect={(id) => setView({ kind: 'group', groupId: id })}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-lc-border bg-lc-card/50 p-2">
        <SidebarMe />
      </div>
    </>
  );
}

function CreateGroupButton({ onCreated }: { onCreated: (groupId: string) => void }) {
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded text-base text-lc-muted hover:text-lc-green"
        title="Create channel"
        aria-label="Create channel"
      >
        +
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex w-full items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="channel name"
        className="flex-1 rounded border border-lc-border bg-lc-black px-1.5 py-0.5 text-[11px] text-lc-white outline-none focus:border-lc-green"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded bg-lc-green px-1.5 py-0.5 text-[10px] text-lc-black disabled:opacity-50"
      >
        {busy ? '…' : 'go'}
      </button>
      <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="text-[10px] text-lc-muted hover:text-lc-white">
        ✕
      </button>
      {err && <span className="ml-1 text-[10px] text-red-400">{err}</span>}
    </form>
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
  return (
    <>
      <button
        onClick={() => onSelect(group.id)}
        style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
        className={
          'flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-left text-sm transition ' +
          (active
            ? 'bg-lc-olive text-lc-white'
            : 'text-lc-muted hover:bg-lc-card hover:text-lc-white')
        }
      >
        {depth > 0 && <span className="text-lc-muted">↳</span>}
        <span className="text-lc-muted">#</span>
        <span className="flex-1 truncate">{group.name ?? group.id.slice(0, 12)}</span>
        {!group.isPublic && <span title="Private" className="text-[10px]">🔒</span>}
        {!group.isOpen && <span title="Closed (invite only)" className="text-[10px]">⊝</span>}
      </button>
      {childIds.map((cid) => {
        const child = groupsById[cid];
        if (!child) return null;
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

function useMyPubkey(): string | null {
  return useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('obeliskord/session');
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
    <div className="relative flex items-center gap-2 px-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left hover:bg-lc-card"
        title="Account"
      >
        <Avatar pubkey={myPubkey} size={9} picture={meta?.picture ?? null} />
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
}: {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatPanel groupId={groupId} showMembers={showMembers} onToggleMembers={onToggleMembers} />
      </div>
      {showMembers && (
        <ResizablePane storageKey={MEMBERS_KEY} defaultWidth={240} min={180} max={400} side="left">
          <MembersPanel groupId={groupId} />
        </ResizablePane>
      )}
    </div>
  );
}

function ChatPanel({
  groupId,
  showMembers,
  onToggleMembers,
}: {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
}) {
  const messages = useMessages(groupId);
  const reactions = useReactions(groupId);
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const admins = useAdmins(groupId);
  const myPubkey = useMyPubkey();
  const isAdmin = !!myPubkey && admins.includes(myPubkey);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, groupId]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setSendError(null);
    try {
      await nostrActions.sendMessage(groupId, content);
      setDraft('');
    } catch (err) {
      console.error('send failed', err);
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-lc-border bg-lc-dark px-5 py-3 shadow-sm">
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
        <div className="flex items-center gap-1">
          {isAdmin && (
            <button
              onClick={() => setShowSettings(true)}
              className="rounded p-1.5 text-lc-muted hover:bg-lc-card hover:text-lc-white"
              title="Channel settings"
              aria-label="Channel settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleMembers}
            className={
              'rounded p-1.5 hover:bg-lc-card ' +
              (showMembers ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white')
            }
            title={showMembers ? 'Hide member list' : 'Show member list'}
            aria-label={showMembers ? 'Hide member list' : 'Show member list'}
            aria-pressed={showMembers}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(groupId)}
            className="rounded p-1.5 text-lc-muted hover:bg-lc-card hover:text-lc-white"
            title="Copy channel id"
            aria-label="Copy channel id"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <SearchBar
            serverName={group?.name ?? 'channel'}
            activeGroupId={groupId}
          />
        </div>
      </header>
      {group?.banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={group.banner}
          alt=""
          className="h-32 w-full shrink-0 border-b border-lc-border object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-lc-muted">
            <div className="text-center">
              <div className="text-base font-medium text-lc-white">
                Welcome to #{group?.name ?? 'channel'}
              </div>
              <div className="mt-1">No messages yet — be the first.</div>
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
                reactions={reactions[m.id] ?? []}
                groupId={groupId}
                grouped={!!grouped}
                isAdmin={isAdmin}
              />
            );
          })
        )}
      </div>

      <form onSubmit={onSend} className="shrink-0 px-5 pb-5">
        {sendError && (
          <p className="mb-2 break-words text-xs text-red-400">{sendError}</p>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-card px-4 py-2 focus-within:border-lc-green">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${group?.name ?? groupId.slice(0, 8)}`}
            disabled={sending}
            className="flex-1 bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="text-xs font-semibold text-lc-green hover:text-lc-green/80 disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </form>

      {showSettings && group && (
        <ChannelSettingsModal group={group} onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

const QUICK_REACTIONS = ['+', '🔥', '⚡', '😂', '🤔'];

function MessageRow({
  msg,
  reactions,
  groupId,
  grouped,
  isAdmin,
}: {
  msg: JsMessage;
  reactions: ReadonlyArray<{ emoji: string }>;
  groupId: string;
  grouped: boolean;
  isAdmin: boolean;
}) {
  const meta = useUserMetadata(msg.pubkey);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reactions) m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [reactions]);
  const [showPicker, setShowPicker] = useState(false);
  const myPubkey = useMyPubkey();
  const [anchor, setAnchor] = useState<{ x: number; y: number; placement?: 'top' | 'bottom' } | null>(null);
  const displayName = meta?.displayName || meta?.name || msg.pubkey.slice(0, 8);
  const openProfile = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ x: r.right + 8, y: r.top, placement: r.top > window.innerHeight / 2 ? 'top' : 'bottom' });
  };

  return (
    <div className={'group relative flex gap-3 rounded px-2 py-0.5 hover:bg-lc-card/40 ' + (grouped ? 'mt-0' : 'mt-3')}>
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
        <div className="whitespace-pre-wrap break-words text-sm text-lc-white">{msg.content}</div>
        {counts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {counts.map(([emoji, n]) => (
              <button
                key={emoji}
                onClick={() => nostrActions.sendReaction(msg.id, msg.pubkey, emoji, groupId)}
                className="rounded-full border border-lc-border bg-lc-card px-2 py-0.5 text-xs text-lc-white hover:border-lc-green"
              >
                {emoji} {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="absolute right-3 top-0 hidden gap-0.5 rounded-md border border-lc-border bg-lc-dark p-0.5 shadow-md group-hover:flex">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => nostrActions.sendReaction(msg.id, msg.pubkey, e, groupId)}
            className="rounded px-1.5 py-0.5 text-sm hover:bg-lc-card"
            title={`React ${e}`}
          >
            {e}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => {
              if (confirm('Delete this message?')) nostrActions.deleteGroupEvent(groupId, msg.id);
            }}
            className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-lc-card"
            title="Delete (admin)"
          >
            🗑
          </button>
        )}
      </div>
      {showPicker && (
        <div className="absolute right-3 top-8 flex gap-1 rounded border border-lc-border bg-lc-dark p-1 shadow-2xl">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                nostrActions.sendReaction(msg.id, msg.pubkey, e, groupId);
                setShowPicker(false);
              }}
              className="rounded p-1 hover:bg-lc-card"
            >
              {e}
            </button>
          ))}
        </div>
      )}
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

// -- Members panel ------------------------------------------------------

function MembersPanel({ groupId }: { groupId: string }) {
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const all = useMemo(() => {
    const set = new Set<string>([...admins, ...members]);
    return Array.from(set);
  }, [admins, members]);
  const adminSet = useMemo(() => new Set(admins), [admins]);

  return (
    <>
      <div className="shrink-0 border-b border-lc-border px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-lc-muted">Members · {all.length}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {all.length === 0 ? (
          <div className="px-2 py-3 text-xs text-lc-muted">No members visible yet (relay must publish kind 39001/39002).</div>
        ) : (
          <>
            {admins.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-green">
                  Admins · {admins.length}
                </div>
                {admins.map((pk) => (
                  <MemberRow key={pk} pubkey={pk} isAdmin />
                ))}
              </>
            )}
            {members.filter((m) => !adminSet.has(m)).length > 0 && (
              <>
                <div className="mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  Members
                </div>
                {members.filter((m) => !adminSet.has(m)).map((pk) => (
                  <MemberRow key={pk} pubkey={pk} isAdmin={false} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
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
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

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
        <div className="flex-1 overflow-y-auto p-5">
          <form onSubmit={saveMeta} className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">Metadata (NIP-29 kind 9002)</div>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="About">
              <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className={inputClasses} />
            </Field>
            <Field label="Picture URL">
              <input value={picture} onChange={(e) => setPicture(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Banner URL (image / gif — see docs/server-banner.md)">
              <input value={banner} onChange={(e) => setBanner(e.target.value)} placeholder="https://… .gif or .png" className={inputClasses} />
            </Field>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-lc-white">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public (readable without joining)
              </label>
              <label className="flex items-center gap-2 text-sm text-lc-white">
                <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
                Open (anyone can join)
              </label>
            </div>
            {metaErr && <div className="text-sm text-red-400">{metaErr}</div>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingMeta}
                className="rounded bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
              >
                {savingMeta ? 'Saving…' : 'Save metadata'}
              </button>
            </div>
          </form>

          <hr className="my-6 border-lc-border" />

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">Add member (NIP-29 kind 9000)</div>
            <form onSubmit={addMember} className="flex gap-2">
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="npub1… or hex pubkey"
                spellCheck={false}
                className={inputClasses}
              />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-lc-muted">
                <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
                admin
              </label>
              <button
                type="submit"
                disabled={memberBusy || !newMember.trim()}
                className="shrink-0 rounded bg-lc-green px-3 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
              >
                {memberBusy ? '…' : 'Add'}
              </button>
            </form>
            {memberErr && <div className="text-sm text-red-400">{memberErr}</div>}

            <div className="mt-4 text-xs font-bold uppercase tracking-wider text-lc-muted">
              Current members · {members.length}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {members.map((pk) => (
                <ManageMemberRow key={pk} groupId={group.id} pubkey={pk} isAdmin={adminSet.has(pk)} />
              ))}
              {members.length === 0 && (
                <div className="text-xs text-lc-muted">
                  No members yet — relay hasn&apos;t published kind 39002 for this group, or only the creator is in it.
                </div>
              )}
            </div>
          </div>
        </div>
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
      <form onSubmit={onSend} className="shrink-0 px-5 pb-5">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-card px-4 py-2 focus-within:border-lc-green">
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

function EmptyState() {
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
