'use client';

/**
 * Mobile shell for /app — full-screen, single-pane experience that runs
 * underneath ≤sm viewports. Implements the 17-screen layout from
 * /Volumes/Ext Disk/WebstormProjects/obelisk-mobile-design/obelisk-mobile.html
 * wired to the existing Nostr bridge.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  nostrActions,
  useIsLoggedIn,
  useIsRehydrating,
  useMyPubkey,
  useGroups,
  useChildrenByParent,
  useMessages,
  useLoadEarlier,
  useDirectMessages,
  useUserMetadata,
  useAdmins,
  useAdminsByGroup,
  useMembers,
  useMyFollows,
  useReactions,
  useConfiguredRelays,
  useCurrentRelayUrl,
  useRelayAccess,
  useConnectionState,
  useGroupMetadataEose,
  useActiveCallByChannel,
  type JsGroup,
  type JsMessage,
  type JsDirectMessage,
} from '@/lib/nostr-bridge';
import LoginModal from '../LoginModal';
import VoiceRoom from '@/components/voice/VoiceRoom';
import VoiceStatusBar from '@/components/voice/VoiceStatusBar';
import { subscribeVoiceJump } from '@/lib/voice/jump-to-voice';
import MessageContent from '@/components/chat/MessageContent';
import EmojiPicker from '@/components/chat/EmojiPicker';
import { uploadToBlossom } from '@/lib/blossom';
import { formatPubkey, pubkeyToNpub, formatTimestamp } from '@/lib/nostr';
import { faviconFor, fetchRelayInfo } from '@/lib/relay-info';
import { useChannelLayout, useRelayOperatorPubkey, applyLayout } from '@/lib/channel-layout';
import { useRelayBranding } from '@/lib/relay-branding';
import { nip19 } from 'nostr-tools';
import { useNotificationStore, type InboxEvent } from '@/store/notification';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { type ScreenName, type NavState, initialNav, urlFor, parseUrl } from './url-state';
// CSS is hoisted to AppGate.tsx so it lands in the route's eagerly-loaded
// stylesheet, not in this dynamic chunk's late-arriving sidecar.


// ───────────────────────────────────────────────────────────────────────────
// helpers

const PALETTES = [
  { from: '#4a78a8', to: '#7ec8ff', text: '#fff' },
  { from: '#a85a78', to: '#ff9ec5', text: '#fff' },
  { from: '#7a5aa8', to: '#c9a8ff', text: '#fff' },
  { from: '#6b8a2e', to: '#b4f953', text: '#0a0a0a' },
  { from: '#3a7050', to: '#8bc34a', text: '#0a0a0a' },
  { from: '#a87b3a', to: '#f0c14a', text: '#0a0a0a' },
];

function paletteFor(seed: string): { from: string; to: string; text: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

function avatarStyle(seed: string): React.CSSProperties {
  const p = paletteFor(seed);
  return { background: `linear-gradient(135deg, ${p.from}, ${p.to})`, color: p.text };
}

function initialsFor(name: string | null | undefined, fallback: string): string {
  const s = (name && name.trim()) || fallback;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return s.slice(0, 2).toUpperCase();
  if (parts.length === 1) return s.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function shortNpub(pubkey: string | null | undefined): string {
  if (!pubkey) return '';
  try { return formatPubkey(pubkey); } catch { return pubkey.slice(0, 8) + '…'; }
}

function relativeTime(ts: number): string {
  return formatTimestamp(ts);
}

function dayKey(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toDateString();
}

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function timeOfDay(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortHost(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

// ───────────────────────────────────────────────────────────────────────────
// shared sub-components

function NameAvatar({
  pubkey,
  name,
  picture,
  size = 36,
  className = '',
}: {
  pubkey: string;
  name?: string | null;
  picture?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = initialsFor(name ?? '', shortNpub(pubkey).slice(0, 2).toUpperCase());
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.floor(size * 0.36)),
    ...avatarStyle(pubkey || name || 'x'),
  };
  return (
    <div className={className} style={style}>
      {picture ? <img src={picture} alt="" /> : initials}
    </div>
  );
}

function GroupAvatar({
  group,
  size = 56,
  className = 'space-icon',
}: {
  group: JsGroup;
  size?: number;
  className?: string;
}) {
  const initials = initialsFor(group.name, group.id.slice(0, 2).toUpperCase());
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.floor(size * 0.34)),
    ...avatarStyle(group.id),
  };
  return (
    <div className={className} style={style}>
      {group.picture ? <img src={group.picture} alt={group.name ?? ''} /> : initials}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// status bar (replicates the design — no real time, just a mock indicator)

function StatusBar() {
  return null; // OS chrome handles real status bar — design's faux bar just steals vertical space on real phones.
}

// ───────────────────────────────────────────────────────────────────────────
// bottom nav

interface NavTab { id: ScreenName; icon: ReactNode; label: string; badge?: number }

const NAV_ICONS: Record<'servers' | 'dms' | 'inbox' | 'you', ReactNode> = {
  servers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  dms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" /></svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
  ),
  you: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  ),
};

function BottomNav({
  active,
  go,
  dmBadge,
  inboxBadge,
}: {
  active: ScreenName;
  go: (s: ScreenName) => void;
  dmBadge?: number;
  inboxBadge?: number;
}) {
  const tabs: NavTab[] = [
    { id: 'server', icon: NAV_ICONS.servers, label: 'Servers' },
    { id: 'dms-list', icon: NAV_ICONS.dms, label: 'DMs', badge: dmBadge },
    { id: 'inbox', icon: NAV_ICONS.inbox, label: 'Inbox', badge: inboxBadge },
    { id: 'settings-profile', icon: NAV_ICONS.you, label: 'You' },
  ];
  const isActive = (id: ScreenName) =>
    active === id ||
    (id === 'server' && (active === 'channel' || active === 'voice-room' || active === 'forum' || active === 'member-list' || active === 'search')) ||
    (id === 'dms-list' && (active === 'dm-thread' || active === 'compose-dm')) ||
    (id === 'settings-profile' && active === 'settings-prefs');
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`nav-item ${isActive(t.id) ? 'active' : ''}`}
          onClick={() => go(t.id)}
          aria-label={t.label}
        >
          {t.icon}
          <span>{t.label}</span>
          {t.badge !== undefined && t.badge > 0 && (
            <span className="nav-badge">{t.badge > 99 ? '99+' : t.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 01 — login

// nip07 is intentionally omitted on mobile — browser extensions don't run on
// phones, and showing the option just leads to "no extension" errors. The
// desktop shell still offers all four.
type LoginMethod = 'nip46' | 'generate' | 'import';

const LoginObeliskMark = () => (
  <svg className="login-mark" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
    <path d="M256,16 L220,72 L196,460 L200,464 L256,464 L256,72 Z" opacity="0.7" />
    <path d="M256,16 L292,72 L316,460 L312,464 L256,464 L256,72 Z" />
  </svg>
);

const LOGIN_METHODS: ReadonlyArray<{
  id: LoginMethod;
  title: string;
  desc: string;
  icon: ReactNode;
}> = [
  {
    id: 'nip46',
    title: 'NIP-46',
    desc: 'Remote signer · Bunker',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'generate',
    title: 'Generate',
    desc: 'Create a new key',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M19 16l.7 2.1L22 19l-2.3.9L19 22l-.7-2.1L16 19l2.3-.9z" />
      </svg>
    ),
  },
  {
    id: 'import',
    title: 'Import',
    desc: 'Paste your nsec',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21 2-9.6 9.6" />
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-3 3 2 2 3-3" />
      </svg>
    ),
  },
];

function LoginScreen() {
  // The mobile login is the mockup's hero + four method cards. Tapping a
  // method opens the production LoginModal pre-scoped to that single method,
  // reusing the existing SDK auth flow without touching the bridge logic.
  const [pickedMethod, setPickedMethod] = useState<LoginMethod | null>(null);

  return (
    <div className="screen login-screen active" data-screen="login">
      <div className="login-hero">
        <LoginObeliskMark />
        <h1>Connect to Nostr</h1>
        <p>Choose your login method.</p>
      </div>
      <div className="login-methods">
        {LOGIN_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className="login-method"
            onClick={() => setPickedMethod(m.id)}
          >
            <span className="login-method-icon">{m.icon}</span>
            <span className="login-method-meta">
              <strong>{m.title}</strong>
              <span>{m.desc}</span>
            </span>
            <span className="login-method-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="login-footer">Powered by @nostr-wot/ui · MIT</div>
      {pickedMethod && (
        <LoginModal
          methods={[pickedMethod]}
          onClose={() => setPickedMethod(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 02 — profile setup (after first login)

function ProfileSetupScreen({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const [name, setName] = useState(meta?.displayName ?? meta?.name ?? '');
  const [about, setAbout] = useState(meta?.about ?? '');
  const [picture, setPicture] = useState(meta?.picture ?? '');
  const [nip05, setNip05] = useState(meta?.nip05 ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (meta) {
      setName((n) => n || meta.displayName || meta.name || '');
      setAbout((a) => a || meta.about || '');
      setPicture((p) => p || meta.picture || '');
      setNip05((n) => n || meta.nip05 || '');
    }
  }, [meta]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const opts: Parameters<typeof nostrActions.editUserMetadata>[0] = {};
      if (name) { opts.name = name; opts.displayName = name; }
      if (about) opts.about = about;
      if (picture) opts.picture = picture;
      if (nip05) opts.nip05 = nip05;
      await nostrActions.editUserMetadata(opts);
      onDone();
    } catch (err) {
      console.warn('[mobile] editUserMetadata failed', err);
      onDone(); // proceed anyway — the user can edit later
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen active" data-screen="profile-setup">
      <div className="setup-header">
        <button className="back-btn" onClick={() => nostrActions.logout()} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <h2>Set up your profile</h2>
        <button className="setup-skip" onClick={onSkip}>Skip</button>
      </div>
      <div className="setup-body">
        <p className="setup-intro">Add a name and picture so others can recognize you on Nostr. You can always update them later.</p>
        <div className="setup-field">
          <label>Display Name</label>
          <div className="setup-input-wrap">
            <input className="setup-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        </div>
        <div className="setup-field">
          <label>Profile Picture URL</label>
          <div className="setup-input-wrap">
            <input className="setup-input" value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <div className="setup-field">
          <label>About</label>
          <textarea className="setup-textarea" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="A short bio…" />
        </div>
        <div className="setup-field">
          <label>NIP-05 (optional)</label>
          <div className="setup-input-wrap">
            <input className="setup-input" value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="you@domain.com" />
          </div>
        </div>
      </div>
      <div className="setup-actions">
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Publishing…' : 'Publish to Nostr'}
        </button>
      </div>
    </div>
  );
}

// Mirrors the desktop ServerRail's suggested-relays list so users get the
// same starting set of NIP-29 relays from the mobile + tile.
const SUGGESTED_RELAYS: ReadonlyArray<{ url: string; fallbackName?: string; fallbackDescription?: string }> = [
  { url: 'wss://relay.obelisk.ar', fallbackName: 'Obelisk relay', fallbackDescription: 'Default NIP-29 relay for Obelisk groups.' },
  { url: 'wss://public.obelisk.ar', fallbackName: 'Obelisk public', fallbackDescription: 'Open NIP-29 relay run by Obelisk.' },
  { url: 'wss://groups.0xchat.com', fallbackName: '0xchat Groups relay', fallbackDescription: 'NIP-29 relay powering 0xchat group messaging.' },
  { url: 'wss://relay.groups.nip29.com', fallbackName: 'relay.groups.nip29.com', fallbackDescription: 'Public NIP-29 groups relay.' },
  { url: 'wss://groups.hzrd149.com', fallbackName: "hzrd149's groups", fallbackDescription: 'A NIP-29 groups relay for hzrd149.' },
  { url: 'wss://pyramid.fiatjaf.com', fallbackName: 'the fiatjaf pyramid', fallbackDescription: 'Invite-only NIP-29 relay run by fiatjaf.' },
];

function AddRelaySheet({ close }: { close: () => void }) {
  const [tab, setTab] = useState<'suggested' | 'custom'>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);

  return (
    <div className="sheet-host" data-screen="add-relay">
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" style={{ maxHeight: '88%' }}>
        <div className="sheet-handle" />
        <div className="zap-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Add a relay
        </div>
        <div className="dms-tabs" style={{ padding: 0 }}>
          <button className={`filter-tab ${tab === 'suggested' ? 'active' : ''}`} onClick={() => setTab('suggested')}>
            Suggested
          </button>
          <button className={`filter-tab ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>
            Custom URL
          </button>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '54vh', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
          {tab === 'suggested' ? (
            SUGGESTED_RELAYS.map((r) => (
              <SuggestedRelayItem
                key={r.url}
                url={r.url}
                fallbackName={r.fallbackName}
                fallbackDescription={r.fallbackDescription}
                alreadyAdded={configuredSet.has(r.url)}
                onAdded={close}
              />
            ))
          ) : (
            <CustomRelayForm onAdded={close} />
          )}
        </div>
        <button className="btn-cancel" onClick={close}>Close</button>
      </div>
    </div>
  );
}

function SuggestedRelayItem({
  url,
  fallbackName,
  fallbackDescription,
  alreadyAdded,
  onAdded,
}: {
  url: string;
  fallbackName?: string;
  fallbackDescription?: string;
  alreadyAdded: boolean;
  onAdded: () => void;
}) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const [name, setName] = useState<string>(fallbackName ?? shortHost(url));
  const [description, setDescription] = useState<string>(fallbackDescription ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRelayInfo(url).then((info) => {
      if (!alive) return;
      setIconUrl(info?.icon || faviconFor(url));
      if (info?.name) setName(info.name);
      if (info?.description) setDescription(info.description);
    });
    return () => { alive = false; };
  }, [url]);

  const add = async () => {
    if (alreadyAdded || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await nostrActions.addRelay(url);
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      background: 'var(--app-surface)',
      border: '1px solid var(--app-line)',
      borderRadius: 12,
    }}>
      <div className="space-icon" style={{ width: 44, height: 44, ...(iconUrl && !iconFailed ? {} : avatarStyle(url)) }}>
        {iconUrl && !iconFailed ? (
          <img src={iconUrl} alt="" onError={() => setIconFailed(true)} />
        ) : (
          shortHost(url).slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--app-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortHost(url)}</div>
        {description && (
          <div style={{ fontSize: 11.5, color: 'var(--app-text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {description}
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: 'var(--presence-dnd)', marginTop: 2 }}>{err}</div>}
      </div>
      <button
        onClick={() => void add()}
        disabled={alreadyAdded || busy}
        style={{
          padding: '8px 14px',
          background: alreadyAdded ? 'var(--app-surface-2)' : 'var(--accent)',
          color: alreadyAdded ? 'var(--app-text-mute)' : 'var(--accent-ink)',
          border: 'none',
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 12,
          flexShrink: 0,
          opacity: busy ? 0.5 : 1,
        }}
      >
        {alreadyAdded ? 'Added' : busy ? '…' : 'Add'}
      </button>
    </div>
  );
}

function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('wss://');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let v = url.trim();
    if (!v) return;
    if (!v.startsWith('ws://') && !v.startsWith('wss://')) v = 'wss://' + v.replace(/^\/*/, '');
    try { new URL(v); } catch { setErr('Invalid URL'); return; }
    setBusy(true);
    try {
      await nostrActions.addRelay(v);
      await nostrActions.switchRelay(v);
      onAdded();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
        Relay URL
      </label>
      <p style={{ fontSize: 12, color: 'var(--app-text-dim)', margin: 0, lineHeight: 1.5 }}>
        Paste a NIP-29 group relay URL. Each relay is a separate &ldquo;server&rdquo; in the rail.
      </p>
      <div className="setup-input-wrap">
        <input
          autoFocus
          className="setup-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
        />
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{err}</div>}
      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="btn-primary"
        style={{ marginTop: 4 }}
      >
        {busy ? 'Adding…' : 'Add relay'}
      </button>
    </form>
  );
}

// Relay tile in the spaces strip — fetches NIP-11 icon, falls back to favicon,
// then to a letter on a gradient. Same pattern the desktop ServerRail uses.
function RelayTile({
  url,
  active,
  onClick,
}: {
  url: string;
  active: boolean;
  onClick: () => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const [nip11Name, setNip11Name] = useState<string>('');
  const [operator, setOperator] = useState<string | null>(null);

  // Tile icon is the domain favicon — not NIP-11 metadata, not kind-30078
  // branding. The relay's metadata is used only for the name + operator pubkey.
  const iconUrl = faviconFor(url);

  useEffect(() => {
    let alive = true;
    fetchRelayInfo(url).then((info) => {
      if (!alive) return;
      if (info?.name) setNip11Name(info.name);
      if (info?.pubkey) setOperator(info.pubkey);
    });
    return () => { alive = false; };
  }, [url]);

  // Operator-published kind-30078 branding only contributes the NAME — the
  // tile icon stays as the relay's own NIP-11 `icon` (favicon fallback). The
  // branding image is the desktop banner, not a circular space-icon.
  const branding = useRelayBranding(url, operator ? [operator] : []);
  const label = branding.name || nip11Name || shortHost(url);
  const showImage = iconUrl && !iconFailed;

  return (
    <button className={`space ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="space-icon" style={!showImage ? avatarStyle(url) : undefined}>
        {showImage ? (
          <img src={iconUrl} alt="" onError={() => setIconFailed(true)} />
        ) : (
          label.slice(0, 1).toUpperCase()
        )}
      </div>
      <span className="space-name">{label}</span>
    </button>
  );
}

// Single row in the channel list — picks the right icon for text/voice/forum
// and surfaces the live-call indicator on voice channels. The `unread` /
// `mentioned` / `active` variants come from the notification store so the
// list matches what the inbox bell shows.
function ChannelRow({
  group,
  live,
  unread,
  mentioned,
  active,
  onClick,
  expandable,
  expanded,
  onToggleExpand,
  indent,
}: {
  group: JsGroup;
  live: boolean;
  unread?: number;
  mentioned?: boolean;
  active?: boolean;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  indent?: boolean;
}) {
  const name = group.name ?? group.id.slice(0, 8);
  if (group.kind === 'voice' || group.kind === 'voice-sfu') {
    return (
      <button className={`ch-row voice ${active ? 'active' : ''}`} onClick={onClick}>
        <span className="ch-icon" style={{ color: live ? 'var(--accent)' : 'var(--app-text-mute)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
        </span>
        <div className="ch-body">
          <div className="ch-row-top">
            <span className="ch-name">{name}</span>
            {live && <span className="voice-live-dot" />}
            {live && <span className="ch-meta" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>live</span>}
          </div>
          {live && (
            <div className="voice-presence">
              <span className="vp-count">live · {group.kind === 'voice-sfu' ? 'SFU' : 'P2P'}</span>
            </div>
          )}
        </div>
      </button>
    );
  }
  const cls = ['ch-row'];
  if (active) cls.push('active');
  if (unread && unread > 0) cls.push('unread');
  if (indent) cls.push('ch-thread');
  if (group.kind === 'forum') {
    // When the forum has thread children, split into two click zones: the row
    // body navigates into the forum view (matches desktop), and the chevron
    // button toggles inline thread expansion (matches the user expectation
    // that an arrow icon means "expand"). Without children there's nothing
    // to expand, so we keep the old single-button behaviour.
    if (expandable && onToggleExpand) {
      cls.push('ch-row-split');
      return (
        <div className={cls.join(' ')}>
          <button className="ch-row-body" onClick={onClick}>
            <span className="ch-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
            </span>
            <span className="ch-name">{name}</span>
            {mentioned && <span className="mention-pill">@you</span>}
            {!mentioned && unread && unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button
            className="ch-chevron-btn"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Collapse threads' : 'Expand threads'}
            aria-expanded={!!expanded}
          >
            <span className={`ch-chevron ${expanded ? 'expanded' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
            </span>
          </button>
        </div>
      );
    }
    return (
      <button className={cls.join(' ')} onClick={onClick}>
        <span className="ch-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
        </span>
        <span className="ch-name">{name}</span>
        {mentioned && <span className="mention-pill">@you</span>}
        {!mentioned && unread && unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
        <span className="ch-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </span>
      </button>
    );
  }
  return (
    <button className={cls.join(' ')} onClick={onClick}>
      <span className="ch-icon">#</span>
      <span className="ch-name">{name}</span>
      {mentioned && <span className="mention-pill">@you</span>}
      {!mentioned && unread && unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}

// Renders a forum's thread children only after they have at least one message
// (mirrors desktop's ForumChildGroupNode — empty/aborted threads stay hidden
// so the inline expansion doesn't accumulate noise).
function ForumThreadChildRow({
  group,
  active,
  onClick,
}: {
  group: JsGroup;
  active: boolean;
  onClick: () => void;
}) {
  const messages = useMessages(group.id);
  if (messages.length === 0) return null;
  return (
    <ChannelRow
      group={group}
      live={false}
      active={active}
      onClick={onClick}
      indent
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 03 — server (groups + channels)

/**
 * Differentiated empty state for the channel list. Without this the user
 * can't tell whether the relay is still loading, blocked them, or genuinely
 * has no channels — all three previously rendered as "No channels yet".
 *
 * Precedence (highest first):
 *   - Whitelisting required — relay is rejecting reads with auth-required
 *     or restricted. Even if we're "connected", the user won't see channels
 *     until they're whitelisted.
 *   - Network issue       — connection failed / dropped, or relay is
 *     unreachable.
 *   - Channels loading    — connecting, authenticating, or connected but
 *     the kind 39000 EOSE hasn't had time to land. We give it ~4s before
 *     declaring "No channels found".
 *   - No channels found   — we've waited long enough and the relay
 *     genuinely returned zero groups.
 */
function ChannelListEmptyState({
  relayAccess,
  connectionState,
  metadataEose,
}: {
  relayAccess: import('@/lib/nostr-bridge').RelayAccessState;
  connectionState: string;
  metadataEose: boolean;
}) {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, [connectionState, relayAccess]);

  let label = 'Channels loading…';
  if (relayAccess === 'auth-required' || relayAccess === 'restricted') {
    label = 'Whitelisting required';
  } else if (
    relayAccess === 'unreachable'
    || relayAccess === 'error'
    || connectionState === 'Disconnected'
    || connectionState.startsWith('Error')
  ) {
    label = 'Network issue';
  } else if (
    connectionState !== 'Connected'
    || relayAccess === 'unknown'
    || relayAccess === 'authenticating'
    || (!metadataEose && !waited)
  ) {
    label = 'Channels loading…';
  } else if (metadataEose) {
    // Relay finished its kind 39000 stream and returned zero events.
    label = 'No channels found';
  } else {
    // Connected for >6s, ok access, but no EOSE for kind 39000. Most
    // relays that silently filter unauthorized reads behave this way —
    // they accept the REQ but never close it. Treat as a whitelist
    // symptom rather than mislabeling as "No channels found".
    label = 'Whitelisting required';
  }

  return (
    <div style={{ padding: '10px 12px', color: 'var(--app-text-mute)', fontSize: 13 }}>
      {label}
    </div>
  );
}

function ServerScreen({
  go,
  selectGroup,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
}) {
  const groups = useGroups();
  const relay = useCurrentRelayUrl();
  const relayAccess = useRelayAccess(relay || null);
  const connectionState = useConnectionState();
  const metadataEose = useGroupMetadataEose();
  const relays = useConfiguredRelays();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const calls = useActiveCallByChannel();
  const adminsByGroup = useAdminsByGroup();
  const operatorPubkey = useRelayOperatorPubkey(relay || null);
  const channelUnreads = useNotificationStore((s) => s.channelUnreads);
  const channelMentions = useNotificationStore((s) => s.channelMentions);
  const [addRelayOpen, setAddRelayOpen] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  // Mirror desktop's per-forum collapsed flag from localStorage so toggles
  // survive reloads and stay in sync across surfaces (key:
  // `obelisk-dex/forum-collapsed/<id>` = '1' means collapsed; missing = expanded).
  const [forumCollapsed, setForumCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    const out: Record<string, boolean> = {};
    try {
      const prefix = 'obelisk-dex/forum-collapsed/';
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        if (window.localStorage.getItem(key) === '1') out[key.slice(prefix.length)] = true;
      }
    } catch {}
    return out;
  });
  const toggleForumCollapsed = useCallback((id: string) => {
    setForumCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== 'undefined') {
        const key = `obelisk-dex/forum-collapsed/${id}`;
        if (next[id]) window.localStorage.setItem(key, '1');
        else window.localStorage.removeItem(key);
      }
      return next;
    });
  }, []);
  const channelListRef = useRef<HTMLDivElement>(null);

  // NIP-11 name + icon for the active relay header. Mirrors RelayTopBar on
  // desktop — both surfaces show the operator-set name (e.g. "Obelisk Public
  // Relay") and fall back to the URL host until the doc resolves.
  const [activeRelayInfo, setActiveRelayInfo] = useState<{ name?: string; icon?: string } | null>(null);
  useEffect(() => {
    if (!relay) { setActiveRelayInfo(null); return; }
    let alive = true;
    fetchRelayInfo(relay).then((info) => {
      if (!alive) return;
      setActiveRelayInfo({ name: info?.name, icon: info?.icon || faviconFor(relay) || undefined });
    });
    return () => { alive = false; };
  }, [relay]);

  // Match the desktop's exact roots/layout pipeline so categories render the
  // same as ServerRail. Critically: a group whose parent isn't in the local
  // store still counts as a root.
  const groupsById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );
  const roots = useMemo(
    () => groups.filter((g) => !g.parent || !groupsById[g.parent]),
    [groups, groupsById],
  );
  const childrenByParent = useChildrenByParent();

  // Build the same author-set the desktop uses to scope shared layout (admins
  // of any visible group + the relay operator from NIP-11).
  const relayAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const pk of adminsByGroup[g.id] ?? []) set.add(pk);
    }
    if (operatorPubkey) set.add(operatorPubkey);
    return Array.from(set);
  }, [groups, adminsByGroup, operatorPubkey]);
  const layout = useChannelLayout(relay || null, relayAuthors);
  const laidOut = useMemo(
    () => applyLayout(layout, roots.map((g) => g.id)),
    [layout, roots],
  );
  const branding = useRelayBranding(relay || null, relayAuthors);

  // Renders a single channel row, plus — for forum containers with thread
  // children — the inline thread list when the user has expanded it. Used by
  // both the categorised and uncategorised lists below.
  const renderChannel = (g: JsGroup) => {
    if (g.kind === 'forum') {
      const childIds = childrenByParent[g.id] ?? [];
      const expandable = childIds.length > 0;
      const isExpanded = expandable && !forumCollapsed[g.id];
      return (
        <Fragment key={g.id}>
          <ChannelRow
            group={g}
            live={!!calls[g.id]}
            unread={channelUnreads[g.id]}
            mentioned={!!channelMentions[g.id]}
            onClick={() => selectGroup(g.id, g.kind)}
            expandable={expandable}
            expanded={isExpanded}
            onToggleExpand={expandable ? () => toggleForumCollapsed(g.id) : undefined}
          />
          {isExpanded && childIds.map((cid) => {
            const child = groupsById[cid];
            if (!child) return null;
            return (
              <ForumThreadChildRow
                key={cid}
                group={child}
                active={false}
                onClick={() => selectGroup(child.id, child.kind)}
              />
            );
          })}
        </Fragment>
      );
    }
    return (
      <ChannelRow
        key={g.id}
        group={g}
        live={!!calls[g.id]}
        unread={channelUnreads[g.id]}
        mentioned={!!channelMentions[g.id]}
        onClick={() => selectGroup(g.id, g.kind)}
      />
    );
  };

  // Active "space" label — prefer the operator-published kind-30078 branding
  // name (matches desktop banner), fall back to NIP-11 doc, then to the URL
  // host while everything resolves.
  const activeSpaceLabel = branding.name || activeRelayInfo?.name || (relay ? shortHost(relay) : 'Obelisk');

  return (
    <div className="screen active" data-screen="server">
      <div className="app-header">
        <h2>{activeSpaceLabel}</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="icon-btn" aria-label="Search this server" onClick={() => go('search')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="icon-btn" aria-label="Server menu" onClick={() => go('settings-profile')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* Spaces strip — one tile per configured relay */}
      <div className="spaces-strip">
        {relays.map((url) => {
          const isActive = url.replace(/\/+$/, '').toLowerCase() === relay.replace(/\/+$/, '').toLowerCase();
          return (
            <RelayTile
              key={url}
              url={url}
              active={isActive}
              onClick={() => { if (!isActive) void nostrActions.switchRelay(url); }}
            />
          );
        })}
        <button className="space" onClick={() => setAddRelayOpen(true)} aria-label="Add relay">
          <div className="space-icon s-add">+</div>
          <span className="space-name">&nbsp;</span>
        </button>
      </div>

      {addRelayOpen && <AddRelaySheet close={() => setAddRelayOpen(false)} />}

      <div className="channel-list" ref={channelListRef}>
        {laidOut.categories.map((cat) => {
          const list = cat.channelIds
            .map((id) => groupsById[id])
            .filter((g): g is JsGroup => !!g);
          const collapsed = !!collapsedCats[cat.id];
          return (
            <div key={cat.id} data-cat-id={cat.id}>
              <button
                className="channel-section-label collapsible"
                onClick={() => setCollapsedCats((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
              >
                <span>{cat.name} · {list.length}</span>
                <span className={`cat-caret ${collapsed ? '' : 'expanded'}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                </span>
              </button>
              {!collapsed && list.map(renderChannel)}
              {!collapsed && list.length === 0 && (
                <div className="cat-empty">No channels here yet.</div>
              )}
            </div>
          );
        })}
        {laidOut.uncategorized.length > 0 && (
          <div data-cat-id="__other">
            {laidOut.categories.length > 0 && (
              <button
                className="channel-section-label collapsible"
                onClick={() => setCollapsedCats((c) => ({ ...c, __other: !c.__other }))}
              >
                <span>Uncategorized · {laidOut.uncategorized.length}</span>
                <span className={`cat-caret ${collapsedCats.__other ? '' : 'expanded'}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                </span>
              </button>
            )}
            {!collapsedCats.__other && laidOut.uncategorized
              .map((id) => groupsById[id])
              .filter((g): g is JsGroup => !!g)
              .map(renderChannel)}
          </div>
        )}
        {roots.length === 0 && (
          <ChannelListEmptyState
            relayAccess={relayAccess}
            connectionState={connectionState}
            metadataEose={metadataEose}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 04 — channel (chat)

function ChannelScreen({
  groupId,
  go,
  back,
  openMsgActions,
  openZap,
  openProfile,
  openMembers,
}: {
  groupId: string;
  go: (s: ScreenName) => void;
  back: () => void;
  openMsgActions: (m: { id: string; pubkey: string; content: string }) => void;
  openZap: (m: { id: string; pubkey: string; content: string }) => void;
  openProfile: (pubkey: string) => void;
  openMembers: () => void;
}) {
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const parentGroup = group?.parent ? groups.find((g) => g.id === group.parent) ?? null : null;
  const headerLabel = parentGroup
    ? `${parentGroup.name ?? parentGroup.id.slice(0, 8)}/${group?.name ?? groupId.slice(0, 8)}`
    : (group?.name ?? groupId.slice(0, 8));
  const messages = useMessages(groupId);
  const reactions = useReactions(groupId);
  const myPubkey = useMyPubkey();
  const relay = useCurrentRelayUrl();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttach = async (file: File) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const url = await uploadToBlossom(file);
      setDraft((d) => d.length ? `${d} ${url}` : url);
    } catch (err) {
      console.warn('[mobile] blossom upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length]);

  // Top-of-list pagination. Live REQ caps at the background limit; older
  // history is paged in here when the user scrolls near the top. Anchor
  // by pre-load scrollHeight to keep the viewport on the same message.
  const { loadEarlier, loading: loadingEarlier, reachedStart } = useLoadEarlier(groupId);
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop < 80 && !loadingEarlier && !reachedStart) {
        const prevHeight = el.scrollHeight;
        void loadEarlier().then(() => {
          requestAnimationFrame(() => {
            const e = messagesRef.current;
            if (!e) return;
            e.scrollTop = e.scrollHeight - prevHeight;
          });
        });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loadEarlier, loadingEarlier, reachedStart]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await nostrActions.sendMessage(groupId, text);
      setDraft('');
    } catch (err) {
      console.warn('[mobile] sendMessage failed', err);
    } finally {
      setSending(false);
    }
  };

  // Group consecutive messages and pre-compute day dividers
  const renderable = useMemo(() => {
    const out: Array<
      | { type: 'divider'; key: string; label: string }
      | { type: 'msg'; key: string; msg: JsMessage }
    > = [];
    let lastDay: string | null = null;
    for (const m of messages) {
      const k = dayKey(m.createdAt);
      if (k !== lastDay) {
        out.push({ type: 'divider', key: `d-${k}`, label: dayLabel(m.createdAt) });
        lastDay = k;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [messages]);

  return (
    <div className="screen active" data-screen="channel">
      <div className="chat-header chat-header-compact">
        <div className="chat-row">
          <div className="chat-title-block">
            <button className="back-btn" onClick={back} aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div className="chat-channel"><span className="hash">#</span>{headerLabel}</div>
          </div>
          <div className="chat-actions">
            <button className="icon-btn" onClick={() => go('search')} aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </button>
            <button className="icon-btn" onClick={openMembers} aria-label="Members">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M3 21a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="3" /><path d="M23 19a4 4 0 0 0-7-2.65" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="messages" ref={messagesRef}>
        {renderable.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <div className="empty-state-title">No messages yet</div>
            <div className="empty-state-desc">Be the first to say hi.</div>
          </div>
        ) : (
          renderable.map((it) =>
            it.type === 'divider' ? (
              <div key={it.key} className="day-divider">{it.label}</div>
            ) : (
              <ChannelMessage
                key={it.key}
                msg={it.msg}
                myPubkey={myPubkey}
                groupId={groupId}
                reactions={reactions[it.msg.id] ?? []}
                onLongPress={() => openMsgActions({ id: it.msg.id, pubkey: it.msg.pubkey, content: it.msg.content })}
                onZap={() => openZap({ id: it.msg.id, pubkey: it.msg.pubkey, content: it.msg.content })}
                onAvatar={() => openProfile(it.msg.pubkey)}
              />
            ),
          )
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAttach(f);
              e.target.value = '';
            }}
          />
          <button
            className="icon-btn"
            style={{ width: 30, height: 30, opacity: uploading ? 0.4 : 1 }}
            aria-label="Attach"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <input
            className="composer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${group?.name ?? 'channel'}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-btns">
            {draft.trim() ? (
              <button className="composer-send" onClick={() => void send()} disabled={sending} aria-label="Send">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14-7-7 14-2-5-5-2z" /></svg>
              </button>
            ) : (
              <button className="icon-btn" aria-label="Emoji" onClick={() => setEmojiOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
              </button>
            )}
          </div>
        </div>
        {emojiOpen && (
          <div className="emoji-sheet-host" onClick={() => setEmojiOpen(false)}>
            <div className="emoji-sheet" onClick={(e) => e.stopPropagation()}>
              <EmojiPicker
                onPick={(emoji) => {
                  setDraft((d) => d + emoji);
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelMessage({
  msg,
  myPubkey,
  groupId,
  reactions,
  onLongPress,
  onZap,
  onAvatar,
}: {
  msg: JsMessage;
  myPubkey: string | null;
  groupId: string;
  reactions: ReadonlyArray<{ id: string; pubkey: string; emoji: string }>;
  onLongPress: () => void;
  onZap: () => void;
  onAvatar: () => void;
}) {
  const meta = useUserMetadata(msg.pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(msg.pubkey);

  // Aggregate reaction emojis with counts
  const grouped = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const ex = m.get(r.emoji) ?? { count: 0, mine: false };
      ex.count++;
      if (r.pubkey === myPubkey) ex.mine = true;
      m.set(r.emoji, ex);
    }
    return Array.from(m.entries()).map(([emoji, info]) => ({ emoji, ...info }));
  }, [reactions, myPubkey]);

  const handleReaction = async (emoji: string, mine: boolean) => {
    if (mine) return; // already reacted with this emoji
    try {
      await nostrActions.sendReaction(msg.id, msg.pubkey, emoji, groupId);
    } catch (err) { console.warn('[mobile] sendReaction failed', err); }
  };

  // Long-press for the action sheet — a 500ms touch hold
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    pressTimer.current = setTimeout(() => onLongPress(), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <div className="msg">
      <div className="msg-ava" style={avatarStyle(msg.pubkey)} onClick={onAvatar} role="button">
        {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(msg.pubkey))}
      </div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name" onClick={onAvatar} role="button">{name}</span>
          <span className="msg-time">{timeOfDay(msg.createdAt)}</span>
        </div>
        <div
          className="msg-text"
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onTouchCancel={cancelPress}
          onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}
        >
          <MessageContent content={msg.content} messageId={msg.id} channelId={groupId} />
        </div>
        {grouped.length > 0 && (
          <div className="reactions">
            {grouped.map((r) => (
              <button
                key={r.emoji}
                className={`reaction ${r.mine ? 'mine' : ''}`}
                onClick={() => void handleReaction(r.emoji, r.mine)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
            <button className="reaction-add" onClick={onLongPress}>+</button>
            <button className="reaction zap" onClick={onZap}>⚡ zap</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 05 — voice room

function VoiceRoomScreen({ groupId, back, openChat }: { groupId: string; back: () => void; openChat: () => void }) {
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const activeCallByChannel = useActiveCallByChannel();
  const call = activeCallByChannel[groupId] ?? null;
  const isSfu = group?.kind === 'voice-sfu';
  // Status only shows once a call exists; the topology (SFU vs P2P) is now
  // expressed by the inline tag next to the title, so the subtitle stays
  // empty on the idle "no one's here" view instead of repeating "SFU room".
  const sub =
    call?.status === 'connected' ? 'Live · connected' :
    call?.status === 'starting' ? 'Starting…' :
    call?.status ? call.status :
    null;

  return (
    <div className="screen voice-room-screen active" data-screen="voice-room">
      <div className="voice-room-topbar">
        <button className="back-btn" onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="voice-room-meta">
          <div className="voice-room-title">
            <svg className="voice-room-mic-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            <span className="voice-room-name">{group?.name ?? 'Voice channel'}</span>
            {isSfu && <span className="voice-sfu-pill" title="Routed through an SFU">SFU</span>}
          </div>
          {sub && <div className="voice-room-sub">{sub}</div>}
        </div>
      </div>
      <div className="voice-room-stage">
        <VoiceRoom
          channelId={groupId}
          channelName={group?.name ?? undefined}
          chatSlot={null}
          isChatOpen={false}
          onToggleChat={openChat}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 06 — DMs list

function DmsListScreen({
  go,
  selectPeer,
  myFollows,
}: {
  go: (s: ScreenName) => void;
  selectPeer: (peer: string) => void;
  myFollows: ReadonlyArray<string>;
}) {
  const dms = useDirectMessages();
  const dmUnreadsMap = useNotificationStore((s) => s.dmUnreads);
  const [tab, setTab] = useState<'follows' | 'others'>('follows');

  const peers = useMemo(() => {
    const list: Array<{ peer: string; latest: JsDirectMessage; unread: boolean }> = [];
    for (const [peer, msgs] of Object.entries(dms)) {
      if (msgs.length === 0) continue;
      const sorted = [...msgs].sort((a, b) => b.createdAt - a.createdAt);
      const latest = sorted[0];
      // Prefer the notification-store count (set by the bridge for live DMs);
      // fall back to the 24h heuristic only when the store hasn't seen this
      // peer yet (e.g. first paint before any live DM has arrived).
      const storedUnread = dmUnreadsMap[peer] ?? 0;
      const unread = storedUnread > 0 ||
        (!latest.outgoing && (Date.now() / 1000 - latest.createdAt) < 86400 && storedUnread === 0 && Object.keys(dmUnreadsMap).length === 0);
      list.push({ peer, latest, unread });
    }
    list.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
    return list;
  }, [dms, dmUnreadsMap]);

  const followsSet = useMemo(() => new Set(myFollows), [myFollows]);
  const filtered = peers.filter((p) =>
    tab === 'follows' ? followsSet.has(p.peer) : !followsSet.has(p.peer),
  );

  const followsCount = peers.filter((p) => followsSet.has(p.peer)).length;
  const othersCount = peers.length - followsCount;

  return (
    <div className="screen active" data-screen="dms-list">
      <div className="app-header">
        <h2>Direct Messages</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="icon-btn" onClick={() => go('search')} aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="icon-btn" onClick={() => go('compose-dm')} aria-label="New message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>

      <div className="dms-tabs">
        <button className={`filter-tab ${tab === 'follows' ? 'active' : ''}`} onClick={() => setTab('follows')}>
          Follows · {followsCount}
        </button>
        <button className={`filter-tab ${tab === 'others' ? 'active' : ''}`} onClick={() => setTab('others')}>
          Others · {othersCount}
        </button>
      </div>

      <div className="dms-list-rows">
        {filtered.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div className="empty-state-title">No conversations yet</div>
            <div className="empty-state-desc">Tap + to start an encrypted DM with anyone on Nostr.</div>
          </div>
        )}
        {filtered.map((p) => (
          <DmRow key={p.peer} peer={p.peer} latest={p.latest} unread={p.unread} onClick={() => selectPeer(p.peer)} />
        ))}
      </div>
    </div>
  );
}

function DmRow({
  peer,
  latest,
  unread,
  onClick,
}: {
  peer: string;
  latest: JsDirectMessage;
  unread: boolean;
  onClick: () => void;
}) {
  const meta = useUserMetadata(peer);
  const name = meta?.displayName || meta?.name || shortNpub(peer);
  return (
    <button className={`dm-row ${unread ? 'unread' : ''}`} onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(peer))}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
          <span className="dm-time">{relativeTime(latest.createdAt)}</span>
        </div>
        <div className="dm-preview">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {latest.outgoing ? 'You: ' : ''}{latest.content}
        </div>
      </div>
      {unread && <span className="unread-dot" />}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 07 — DM thread

function DmThreadScreen({
  peer,
  back,
  openProfile,
}: {
  peer: string;
  back: () => void;
  openProfile: (pubkey: string) => void;
}) {
  const dms = useDirectMessages();
  const meta = useUserMetadata(peer);
  const myPubkey = useMyPubkey();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const list = dms[peer] ?? [];
    return [...list].sort((a, b) => a.createdAt - b.createdAt);
  }, [dms, peer]);

  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await nostrActions.sendDirectMessage(peer, text);
      setDraft('');
    } catch (err) {
      console.warn('[mobile] sendDirectMessage failed', err);
    } finally {
      setSending(false);
    }
  };

  const peerName = meta?.displayName || meta?.name || shortNpub(peer);

  // Day dividers + bubbles
  const grouped = useMemo(() => {
    const out: Array<
      | { type: 'divider'; key: string; label: string }
      | { type: 'msg'; key: string; msg: JsDirectMessage }
    > = [];
    let lastDay: string | null = null;
    for (const m of messages) {
      const k = dayKey(m.createdAt);
      if (k !== lastDay) {
        out.push({ type: 'divider', key: `d-${k}`, label: dayLabel(m.createdAt) });
        lastDay = k;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [messages]);

  return (
    <div className="screen active" data-screen="dm-thread">
      <div className="dm-header">
        <button className="back-btn" onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="dm-ava-list" style={{ ...avatarStyle(peer), width: 36, height: 36, fontSize: 13 }} onClick={() => openProfile(peer)}>
          {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(peerName, shortNpub(peer))}
        </div>
        <div className="dm-header-meta" onClick={() => openProfile(peer)}>
          <div className="dm-header-name">{peerName}</div>
          <div className="dm-header-pubkey">
            <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortNpub(peer)} · NIP-04</span>
          </div>
        </div>
      </div>

      <div className="dm-messages" ref={msgsRef}>
        <div className="dm-encryption-pill">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Messages are NIP-04 encrypted end-to-end
        </div>
        {grouped.map((it) =>
          it.type === 'divider' ? (
            <div key={it.key} className="day-divider">{it.label}</div>
          ) : (
            <div key={it.key} className={`dm-bubble ${it.msg.outgoing ? 'outgoing delivered' : 'incoming'}`}>
              {it.msg.content}
              <span className="dm-bubble-time">{timeOfDay(it.msg.createdAt)}</span>
            </div>
          ),
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Attach">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <input
            className="composer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Encrypted message (NIP-04)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-btns">
            {draft.trim() ? (
              <button className="composer-send" onClick={() => void send()} disabled={sending} aria-label="Send">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14-7-7 14-2-5-5-2z" /></svg>
              </button>
            ) : (
              <button className="icon-btn" aria-label="Emoji">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 08 — inbox (mentions, replies, DMs, zaps)

type InboxFilter = 'all' | 'mentions' | 'replies' | 'dms' | 'zaps';

function InboxScreen({
  selectGroup,
  selectPeer,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
  selectPeer: (peer: string) => void;
}) {
  const events = useNotificationStore((s) => s.inboxEvents);
  const markInboxRead = useNotificationStore((s) => s.markInboxRead);
  const groups = useGroups();

  const [tab, setTab] = useState<InboxFilter>('all');
  const filtered = useMemo(() => {
    if (tab === 'all') return events;
    const want = tab === 'dms' ? 'dm' : tab === 'mentions' ? 'mention' : tab === 'replies' ? 'reply' : 'zap';
    return events.filter((e) => e.type === want);
  }, [events, tab]);

  const handleJump = (e: InboxEvent) => {
    if (e.type === 'dm') {
      selectPeer(e.senderPubkey);
    } else if (e.channelId) {
      const g = groups.find((x) => x.id === e.channelId);
      selectGroup(e.channelId, g?.kind ?? 'text');
    }
    markInboxRead();
  };

  return (
    <div className="screen active" data-screen="inbox">
      <div className="app-header">
        <h2>Inbox</h2>
        <button className="mark-all-read" onClick={markInboxRead}>Mark all read</button>
      </div>
      <div className="filter-tabs">
        <button className={`filter-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All · {events.length}</button>
        <button className={`filter-tab ${tab === 'mentions' ? 'active' : ''}`} onClick={() => setTab('mentions')}>@mentions</button>
        <button className={`filter-tab ${tab === 'replies' ? 'active' : ''}`} onClick={() => setTab('replies')}>Replies</button>
        <button className={`filter-tab ${tab === 'dms' ? 'active' : ''}`} onClick={() => setTab('dms')}>DMs</button>
        <button className={`filter-tab ${tab === 'zaps' ? 'active' : ''}`} onClick={() => setTab('zaps')}>Zaps</button>
      </div>
      <div className="activity-list">
        {filtered.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
            <div className="empty-state-title">All caught up</div>
            <div className="empty-state-desc">Mentions, replies, DMs, and zaps land here as they arrive.</div>
          </div>
        )}
        {filtered.map((e) => (
          <InboxCard key={e.id} event={e} onJump={() => handleJump(e)} />
        ))}
      </div>
    </div>
  );
}

function InboxCard({ event, onJump }: { event: InboxEvent; onJump: () => void }) {
  const meta = useUserMetadata(event.senderPubkey);
  const name = meta?.displayName || meta?.name || shortNpub(event.senderPubkey);
  const tsSec = Math.floor(new Date(event.createdAt).getTime() / 1000);
  const typeLabel: Record<InboxEvent['type'], string> = {
    mention: '@ Mentioned you',
    reply: '↩ Replied to you',
    dm: 'Direct message',
    zap: '⚡ Zap received',
    everyone: '@ everyone',
    message: 'Message',
  };
  return (
    <button
      className={`mention-card ${event.type === 'mention' ? 'urgent' : ''}`}
      style={!event.read ? undefined : { opacity: 0.65 }}
      onClick={onJump}
    >
      <div className="mc-context">
        <span className={`notif-type ${event.type}`}>
          {event.type === 'dm' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          )}
          {typeLabel[event.type]}
        </span>
        <span className="mc-time">{relativeTime(tsSec)}</span>
      </div>
      <div className="mc-msg" style={{ marginTop: 6 }}>
        <div className="mc-ava" style={avatarStyle(event.senderPubkey)}>
          {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(event.senderPubkey))}
        </div>
        <div className="mc-body">
          <div className="mc-name" style={{ color: 'var(--app-text)' }}>{name}</div>
          <div className="mc-text" style={{ color: 'var(--app-text-dim)' }}>{event.preview}</div>
        </div>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 09 — profile view

function ProfileViewScreen({
  pubkey,
  back,
  openDm,
}: {
  pubkey: string;
  back: () => void;
  openDm: (peer: string) => void;
}) {
  const meta = useUserMetadata(pubkey);
  const myPubkey = useMyPubkey();
  const isMe = myPubkey === pubkey;
  const name = meta?.displayName || meta?.name || shortNpub(pubkey);

  return (
    <div className="screen profile-view-screen active" data-screen="profile-view">
      <div
        className="profile-view-banner"
        style={meta?.banner ? { backgroundImage: `url(${meta.banner})` } : undefined}
      >
        <div className="profile-view-topbar">
          <button className="back-btn" onClick={back} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button className="icon-btn" aria-label="More">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
        </div>
      </div>
      <div className="profile-view-avatar" style={avatarStyle(pubkey)}>
        {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(pubkey).slice(0, 2).toUpperCase())}
      </div>
      <div className="profile-view-meta">
        <div className="profile-view-name">{name}</div>
        {meta?.nip05 && <div className="profile-view-nip05">{meta.nip05}</div>}
        <div className="profile-view-npub">{shortNpub(pubkey)}</div>
      </div>
      {meta?.about && <p className="profile-view-bio">{meta.about}</p>}
      {!isMe && (
        <div className="profile-view-actions">
          <button className="profile-action follow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M3 21a6 6 0 0 1 12 0" /><path d="M19 8v6M16 11h6" /></svg>
            Follow
          </button>
          <button className="profile-action" onClick={() => openDm(pubkey)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            Message
          </button>
          <button className="profile-action zap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
            Zap
          </button>
        </div>
      )}
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--app-text-mute)', fontSize: 12, textAlign: 'center', gap: 6 }}>
        <span>Posts and replies will surface here</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>(kind 1 timeline · coming soon)</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10 — member list

function MemberListScreen({ groupId, back, openProfile }: { groupId: string; back: () => void; openProfile: (p: string) => void }) {
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);

  const adminSet = useMemo(() => new Set(admins), [admins]);
  const nonAdminMembers = useMemo(() => members.filter((m) => !adminSet.has(m)), [members, adminSet]);

  return (
    <div className="screen member-list-screen active" data-screen="member-list">
      <div className="dm-header">
        <button className="back-btn" onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="dm-header-meta">
          <div className="dm-header-name">#{group?.name ?? 'channel'} · members</div>
          <div className="dm-header-pubkey">
            {members.length} connected
          </div>
        </div>
      </div>
      <div className="search-body">
        {admins.length > 0 && (
          <>
            <div className="member-section-label">Admins · {admins.length}</div>
            {admins.map((p) => <MemberRow key={p} pubkey={p} role="admin" onClick={() => openProfile(p)} />)}
          </>
        )}
        {nonAdminMembers.length > 0 && (
          <>
            <div className="member-section-label">Members · {nonAdminMembers.length}</div>
            {nonAdminMembers.map((p) => <MemberRow key={p} pubkey={p} onClick={() => openProfile(p)} />)}
          </>
        )}
        {members.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No members</div>
            <div className="empty-state-desc">No relay-published 39002 members yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ pubkey, role, onClick }: { pubkey: string; role?: 'admin'; onClick: () => void }) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(pubkey);
  return (
    <button className="member-row" onClick={onClick}>
      <div className="dm-ava-list" style={{ ...avatarStyle(pubkey), width: 36, height: 36, fontSize: 12 }}>
        {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(pubkey))}
      </div>
      <div className="member-row-meta">
        <span className="member-row-name">{name}</span>
        <span className="member-row-nip">{meta?.nip05 ?? shortNpub(pubkey)}</span>
      </div>
      {role === 'admin' && <span className="role-badge b-core">admin</span>}
      <span className="member-row-presence on" />
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11 — compose DM (search + open thread)

function ComposeDmScreen({ back, selectPeer }: { back: () => void; selectPeer: (peer: string) => void }) {
  const [query, setQuery] = useState('');
  const dms = useDirectMessages();

  const recent = useMemo(() => Object.keys(dms).slice(0, 20), [dms]);

  const tryNpub = (input: string): string | null => {
    const t = input.trim();
    if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase();
    try {
      const decoded = nip19.decode(t);
      if (decoded.type === 'npub') return decoded.data as string;
      if (decoded.type === 'nprofile') return (decoded.data as { pubkey: string }).pubkey;
    } catch { /* fallthrough */ }
    return null;
  };

  const decoded = tryNpub(query);

  return (
    <div className="screen compose-dm-screen active" data-screen="compose-dm">
      <div className="compose-dm-header">
        <button className="compose-dm-cancel" onClick={back}>Cancel</button>
        <h2>New message</h2>
        <button
          className={`compose-dm-next ${decoded ? 'active' : ''}`}
          disabled={!decoded}
          onClick={() => decoded && selectPeer(decoded)}
        >
          Next
        </button>
      </div>
      <div className="compose-dm-to">
        <span className="compose-dm-to-label">To:</span>
        <input
          className="compose-dm-to-input"
          placeholder="npub… or hex pubkey"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="search-section-label">Recent</div>
      <div className="compose-dm-body">
        {recent.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No recent conversations</div>
            <div className="empty-state-desc">Paste an npub above and tap Next.</div>
          </div>
        )}
        {recent.map((p) => <ComposeRecentRow key={p} peer={p} onClick={() => selectPeer(p)} />)}
      </div>
    </div>
  );
}

function ComposeRecentRow({ peer, onClick }: { peer: string; onClick: () => void }) {
  const meta = useUserMetadata(peer);
  const name = meta?.displayName || meta?.name || shortNpub(peer);
  return (
    <button className="dm-row" onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <img src={meta.picture} alt="" /> : initialsFor(name, shortNpub(peer))}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
        </div>
        <div className="dm-preview">{meta?.nip05 ?? shortNpub(peer)}</div>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 12 — search

function SearchScreen({ back }: { back: () => void }) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<'all' | 'from' | 'in' | 'mentions' | 'has-image'>('all');
  const groups = useGroups();
  const relay = useCurrentRelayUrl();

  return (
    <div className="screen search-screen active" data-screen="search">
      <div className="search-header">
        <button className="back-btn" onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="text"
            placeholder="Search messages, people, channels…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && <button className="search-clear" onClick={() => setQuery('')}>×</button>}
        </div>
      </div>
      <div className="search-context-pill">in:{shortHost(relay)}</div>
      <div className="search-filter-chips">
        <button className={`search-chip ${chip === 'all' ? 'active' : ''}`} onClick={() => setChip('all')}>All</button>
        <button className={`search-chip ${chip === 'from' ? 'active' : ''}`} onClick={() => setChip('from')}>from:</button>
        <button className={`search-chip ${chip === 'in' ? 'active' : ''}`} onClick={() => setChip('in')}>in:#channel</button>
        <button className={`search-chip ${chip === 'mentions' ? 'active' : ''}`} onClick={() => setChip('mentions')}>mentions:@you</button>
        <button className={`search-chip ${chip === 'has-image' ? 'active' : ''}`} onClick={() => setChip('has-image')}>has:image</button>
      </div>
      <div className="search-section-label">Channels</div>
      <div className="search-body">
        {groups
          .filter((g) => !query || (g.name ?? '').toLowerCase().includes(query.toLowerCase()))
          .slice(0, 30)
          .map((g) => (
            <button key={g.id} className="ch-row" onClick={() => { /* navigate */ }}>
              <span className="ch-icon">#</span>
              <span className="ch-name">{g.name ?? g.id.slice(0, 8)}</span>
            </button>
          ))}
        {!query && (
          <div className="search-empty">
            <div className="search-empty-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            Type to filter channels.<br />Server-side message search uses <code>from:</code>, <code>in:#</code>, <code>has:</code>.
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 13 — forum (channel-of-channels)

function ForumScreen({
  groupId,
  back,
  selectChild,
}: {
  groupId: string;
  back: () => void;
  selectChild: (childId: string) => void;
}) {
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const children = groups.filter((g) => g.parent === groupId);
  const relay = useCurrentRelayUrl();

  return (
    <div className="screen forum-screen active" data-screen="forum">
      <div className="chat-header">
        <div className="chat-breadcrumb">
          <button className="back-btn" onClick={back} style={{ marginLeft: -6 }} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="space-name-bc">{shortHost(relay)}</span>
          <span className="sep">/</span>
          <span>{group?.name ?? 'forum'}</span>
        </div>
        <div className="chat-row">
          <div className="chat-title-block">
            <div className="chat-channel"><span className="hash">#</span>{group?.name ?? 'forum'}</div>
            <span className="role-badge" style={{ marginLeft: 6 }}>forum</span>
          </div>
        </div>
      </div>
      <button className="forum-new-thread" onClick={() => { /* TODO: open new-thread sheet */ }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        New thread
      </button>
      <div className="forum-list">
        {children.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No threads yet</div>
            <div className="empty-state-desc">Tap "New thread" to start one.</div>
          </div>
        )}
        {children.map((c) => <ForumCard key={c.id} group={c} onClick={() => selectChild(c.id)} />)}
      </div>
    </div>
  );
}

function ForumCard({ group, onClick }: { group: JsGroup; onClick: () => void }) {
  return (
    <button className="forum-card" onClick={onClick}>
      <div className="forum-card-row">
        <div className="dm-ava-list" style={{ ...avatarStyle(group.id), width: 36, height: 36, fontSize: 12 }}>
          {group.picture ? <img src={group.picture} alt="" /> : initialsFor(group.name, group.id.slice(0, 2).toUpperCase())}
        </div>
        <div className="forum-card-body">
          <div className="forum-card-title">{group.name ?? group.id.slice(0, 8)}</div>
          {group.about && <div className="forum-card-preview">{group.about}</div>}
          <div className="forum-card-meta">
            <span>{group.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 14 — message actions sheet (over channel)

function MessageActionsSheet({
  msg,
  close,
  onZap,
}: {
  msg: { id: string; pubkey: string; content: string };
  close: () => void;
  onZap: () => void;
}) {
  const meta = useUserMetadata(msg.pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(msg.pubkey);

  return (
    <div className="sheet-host" data-screen="msg-actions">
      <div className="ma-context">
        <div className="ma-context-msg">
          <div className="ma-context-msg-name">{name}</div>
          <div className="ma-context-msg-text">{msg.content}</div>
        </div>
      </div>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="ma-quick-reactions">
          {['👍', '❤️', '🚀', '🔥', '👀', '+'].map((e) => (
            <button key={e} className="ma-quick-react" onClick={async () => {
              if (e !== '+') {
                try {
                  // We need groupId — caller must close, so reaction is fired from the opener.
                  // For now: emit through window event so the channel can pick it up.
                  window.dispatchEvent(new CustomEvent('obelisk-mobile:react', { detail: { msg, emoji: e } }));
                } catch { /* ignore */ }
              }
              close();
            }}>{e}</button>
          ))}
        </div>
        <div className="ma-action-list">
          <button className="ma-action" onClick={close}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            Reply
          </button>
          <button className="ma-action" onClick={() => { try { navigator.clipboard?.writeText(msg.content); } catch { /* ignore */ } close(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copy text
          </button>
          <button className="ma-action zap" onClick={onZap}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
            Send zap
          </button>
          <button className="ma-action" onClick={() => { try { navigator.clipboard?.writeText(msg.id); } catch { /* ignore */ } close(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copy event id
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 15 — zap modal sheet

function ZapModalSheet({
  msg,
  close,
}: {
  msg: { id: string; pubkey: string; content: string };
  close: () => void;
}) {
  const meta = useUserMetadata(msg.pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(msg.pubkey);
  const [amount, setAmount] = useState(2100);
  const presets = [
    { v: 21, label: '21' },
    { v: 100, label: '100' },
    { v: 500, label: '500' },
    { v: 2100, label: '2.1k' },
    { v: 5000, label: '5k' },
  ];

  return (
    <div className="sheet-host" data-screen="zap-modal">
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="zap-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
          Send a zap
        </div>
        <div className="zap-recipient">
          <NameAvatar pubkey={msg.pubkey} name={name} picture={meta?.picture} className="me-avatar" size={40} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--app-text)', fontSize: 14 }}>{name}</div>
            {meta?.nip05 && <div style={{ fontSize: 11, color: 'var(--accent)' }}>{meta.nip05}</div>}
          </div>
        </div>
        <div className="zap-amounts">
          {presets.map((p) => (
            <button
              key={p.v}
              className={`zap-amount ${amount === p.v ? 'active' : ''}`}
              onClick={() => setAmount(p.v)}
            >
              {p.label}
              <span className="zap-amount-sub">sats</span>
            </button>
          ))}
          <button className="zap-amount">···<span className="zap-amount-sub">custom</span></button>
        </div>
        <div className="zap-memo">"{msg.content.slice(0, 80)}{msg.content.length > 80 ? '…' : ''}"</div>
        <div className="zap-wallet">
          <span className="settings-status-dot ok" />
          Wallet · NWC · check on settings
        </div>
        <button className="btn-primary" onClick={close}>⚡ Send {amount.toLocaleString()} sats</button>
        <button className="btn-cancel" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 16 — settings · profile

function SettingsProfileScreen({ go }: { go: (s: ScreenName) => void }) {
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const name = meta?.displayName || meta?.name || shortNpub(myPubkey ?? '');

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  };

  return (
    <div className="screen active" data-screen="settings-profile">
      <div className="app-header">
        <h2>You</h2>
      </div>
      <div className="settings-tabs">
        <button className="settings-tab active">Profile</button>
        <button className="settings-tab" onClick={() => go('settings-prefs')}>Preferences</button>
      </div>
      <div className="settings-body">
        <div className="settings-card profile-card">
          <NameAvatar pubkey={myPubkey ?? ''} name={name} picture={meta?.picture} size={60} className="me-avatar large" />
          <div className="profile-card-meta">
            <div className="profile-name">{name}</div>
            {meta?.nip05 && <div className="profile-nip05">{meta.nip05}</div>}
            <div className="profile-npub">{shortNpub(myPubkey ?? '')}</div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">Identity</div>
          <button className="settings-row action" onClick={() => myPubkey && copy(pubkeyToNpub(myPubkey))}>
            <span>Copy npub</span>
            <span className="settings-row-meta">{shortNpub(myPubkey ?? '')}</span>
          </button>
          <button className="settings-row action" onClick={() => myPubkey && copy(myPubkey)}>
            <span>Copy hex pubkey</span>
            <span className="settings-row-meta muted">tap to copy</span>
          </button>
          {myPubkey && (
            <a
              className="settings-row action"
              href={`https://njump.me/${pubkeyToNpub(myPubkey)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <span>Open in another client</span>
              <span className="settings-row-meta muted">njump.me ↗</span>
            </a>
          )}
        </div>
        <button className="settings-btn-primary" onClick={() => { /* future: edit profile sheet */ }}>
          Edit Nostr Profile
        </button>
        <button className="settings-btn-danger" onClick={() => { void nostrActions.logout(); }}>
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 17 — settings · preferences

function SettingsPrefsScreen({ go }: { go: (s: ScreenName) => void }) {
  const relays = useConfiguredRelays();
  const currentRelay = useCurrentRelayUrl();

  return (
    <div className="screen active" data-screen="settings-prefs">
      <div className="app-header">
        <h2>You</h2>
      </div>
      <div className="settings-tabs">
        <button className="settings-tab" onClick={() => go('settings-profile')}>Profile</button>
        <button className="settings-tab active">Preferences</button>
      </div>
      <div className="settings-body">
        <div className="settings-section">
          <div className="settings-section-title">Relays · {relays.length}</div>
          {relays.map((url) => {
            const isCurrent = url.replace(/\/+$/, '').toLowerCase() === currentRelay.replace(/\/+$/, '').toLowerCase();
            return (
              <button
                key={url}
                className="settings-row action"
                onClick={() => { if (!isCurrent) void nostrActions.switchRelay(url); }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shortHost(url)}
                </span>
                <span className={`settings-row-meta ${isCurrent ? 'ok' : 'muted'}`}>{isCurrent ? 'active' : 'switch'}</span>
              </button>
            );
          })}
        </div>
        <div className="settings-section">
          <div className="settings-section-title">App</div>
          <div className="settings-row">
            <span>Theme</span>
            <span className="settings-row-meta">La Crypta · dark</span>
          </div>
          <div className="settings-row">
            <span>Version</span>
            <span className="settings-row-meta muted">obelisk · mobile</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// rehydrating

function RehydratingScreen() {
  return (
    <div className="screen active">
      <div className="conn-screen">
        <div className="conn-spinner" />
        <div style={{ color: 'var(--app-text-dim)', fontSize: 13 }}>Reconnecting…</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// shell — owns nav state

export default function MobileShell() {
  const isLoggedIn = useIsLoggedIn();
  const isRehydrating = useIsRehydrating();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const groups = useGroups();
  const dms = useDirectMessages();
  const myFollows = useMyFollows();

  const [nav, setNav] = useState<NavState>(initialNav);
  const navRef = useRef<NavState>(initialNav);
  const currentRelayUrl = useCurrentRelayUrl();
  const relayRef = useRef<string | null>(currentRelayUrl ?? null);
  const didInitRef = useRef(false);
  const exitArmedRef = useRef<number>(0);
  const [exitToast, setExitToast] = useState(false);
  const router = useRouter();
  const [showSetup, setShowSetup] = useState(false);
  // Slide direction for the screen-mount animation. 'forward' slides in
  // from the right (push), 'back' slides in from the left (pop). Cleared
  // after each animation so a same-screen rerender doesn't replay.
  const [slideDir, setSlideDir] = useState<'forward' | 'back' | null>(null);

  // First-time-after-login profile setup gate
  useEffect(() => {
    if (!isLoggedIn || !myPubkey) return;
    if (typeof window === 'undefined') return;
    const key = `obelisk-dex/mobile-setup-seen/${myPubkey}`;
    const seen = window.localStorage.getItem(key);
    if (seen) return;
    if (meta && (meta.name || meta.displayName)) {
      window.localStorage.setItem(key, '1');
      return;
    }
    // Show setup after a brief grace period (let kind:0 arrive)
    const t = setTimeout(() => {
      const fresh = window.localStorage.getItem(key);
      if (fresh) return;
      setShowSetup(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [isLoggedIn, myPubkey, meta]);

  const dismissSetup = useCallback(() => {
    if (myPubkey) {
      try { window.localStorage.setItem(`obelisk-dex/mobile-setup-seen/${myPubkey}`, '1'); } catch { /* ignore */ }
    }
    setShowSetup(false);
  }, [myPubkey]);

  // ── navigation helpers ───────────────────────────────────────────────
  // We update `useChatStore.activeChannelId` / `useDMStore.activeDMPubkey`
  // via `setState` rather than calling the slice's `setActiveChannel` /
  // `setActiveDM` actions — those actions ALSO blow away `messages` and
  // re-flip `isLoadingMessages: true`, which is fine for the desktop chat
  // panel (its source of truth) but would be redundant churn on mobile,
  // where messages come from the bridge hook instead. We only need the
  // active id so `read-gates.isUserWatching*` knows the user is here.
  // Push a new nav state into the browser history. The popstate handler is
  // the single mechanism for "back" — every back-button (device, browser,
  // swipe-back) pops one entry, and the listener replays the previous nav.
  const pushNav = useCallback((updater: (n: NavState) => NavState, dir: 'forward' | 'back' = 'forward') => {
    setSlideDir(dir);
    setNav((n) => {
      const next = updater(n);
      navRef.current = next;
      if (typeof window !== 'undefined') {
        try {
          window.history.pushState({ nav: next }, '', urlFor(next, relayRef.current));
        } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  const go = useCallback((screen: ScreenName, dir: 'forward' | 'back' = 'forward') => {
    if (dir === 'back' && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    if (screen !== 'channel') useChatStore.setState({ activeChannelId: null });
    if (screen !== 'dm-thread') useDMStore.setState({ activeDMPubkey: null });
    pushNav((n) => ({ ...n, screen, baseScreen: null, msgContext: null }), dir);
  }, [pushNav]);

  // VoiceStatusBar "jump back to call": the bar lives outside the screens host
  // and can't reach `pushNav` directly, so it dispatches through the
  // jump-to-voice pub/sub. Mirror the DesktopShell handler — switch relay
  // first if the call's home relay differs, then push the voice-room screen.
  useEffect(() => {
    return subscribeVoiceJump(async ({ channelId, relayUrl }) => {
      if (relayUrl && currentRelayUrl && relayUrl !== currentRelayUrl) {
        try { await nostrActions.switchRelay(relayUrl); }
        catch (err) { console.warn('[mobile] switchRelay for voice jump failed', err); }
      }
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav((n) => ({ ...n, screen: 'voice-room', groupId: channelId, baseScreen: null, msgContext: null }));
    });
  }, [currentRelayUrl, pushNav]);

  // ── initial URL parse + history seeding ─────────────────────────────
  useEffect(() => {
    if (didInitRef.current) return;
    if (!isLoggedIn) return;
    if (typeof window === 'undefined') return;
    didInitRef.current = true;
    const { nav: parsed, relay } = parseUrl(window.location.search);
    if (relay) {
      const cur = (currentRelayUrl ?? '').replace(/\/+$/, '').toLowerCase();
      const next = relay.replace(/\/+$/, '').toLowerCase();
      if (next !== cur) {
        void nostrActions.switchRelay(relay).catch((err) => {
          console.warn('[mobile] switchRelay from deep-link failed', err);
        });
      }
    }
    setNav(parsed);
    navRef.current = parsed;
    if (parsed.screen === 'channel' && parsed.groupId) {
      useChatStore.setState({ activeChannelId: parsed.groupId, isNearBottom: true });
    } else if (parsed.screen === 'dm-thread' && parsed.dmPeer) {
      useDMStore.setState({ activeDMPubkey: parsed.dmPeer });
    }
    // Guard entry: a sentinel sits BEHIND the current nav so the first
    // press of back lands on the guard (we re-push and arm the toast),
    // and a second press within 2 s confirms exit to the landing page.
    const seedUrl = urlFor(parsed, relay ?? currentRelayUrl ?? null);
    try {
      window.history.replaceState({ guard: true }, '', seedUrl);
      window.history.pushState({ nav: parsed }, '', seedUrl);
    } catch { /* ignore */ }
  }, [isLoggedIn, currentRelayUrl]);

  // Keep relayRef + URL relay param in sync without pushing history entries.
  useEffect(() => {
    relayRef.current = currentRelayUrl ?? null;
    if (typeof window === 'undefined') return;
    if (!didInitRef.current) return;
    const url = urlFor(navRef.current, currentRelayUrl ?? null);
    try {
      window.history.replaceState(window.history.state, '', url);
    } catch { /* ignore */ }
  }, [currentRelayUrl]);

  // ── popstate: drives all "back" navigation ──────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: PopStateEvent) => {
      const s = (e.state ?? null) as { nav?: NavState; guard?: boolean } | null;
      if (s?.guard) {
        const now = Date.now();
        if (now - exitArmedRef.current < 2000) {
          exitArmedRef.current = 0;
          router.push('/');
          return;
        }
        exitArmedRef.current = now;
        setExitToast(true);
        window.setTimeout(() => setExitToast(false), 2000);
        // Re-push current nav so the user stays on their screen.
        try {
          window.history.pushState({ nav: navRef.current }, '', urlFor(navRef.current, relayRef.current));
        } catch { /* ignore */ }
        return;
      }
      if (s?.nav) {
        const next = s.nav;
        setSlideDir('back');
        setNav(next);
        navRef.current = next;
        useChatStore.setState({ activeChannelId: next.screen === 'channel' ? next.groupId : null });
        useDMStore.setState({ activeDMPubkey: next.screen === 'dm-thread' ? next.dmPeer : null });
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [router]);

  // ── horizontal swipe navigation ─────────────────────────────────────
  // Swipe between bottom-nav tabs (server ↔ dms-list ↔ inbox ↔ settings)
  // and swipe-right on a sub-screen returns to its parent tab. Touches that
  // start inside a horizontal scroller (relay strip, filter tabs, message
  // list, voice stage) are ignored so those keep their own scroll behavior.
  const NAV_ORDER: ScreenName[] = ['server', 'dms-list', 'inbox', 'settings-profile'];
  const SUB_TO_NAV: Partial<Record<ScreenName, ScreenName>> = {
    channel: 'server',
    'voice-room': 'server',
    forum: 'server',
    'member-list': 'server',
    search: 'server',
    'dm-thread': 'dms-list',
    'compose-dm': 'dms-list',
    'profile-view': 'server',
    'settings-prefs': 'settings-profile',
  };
  const swipeStart = useRef<{ x: number; y: number; t: number; ignore: boolean } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) { swipeStart.current = null; return; }
    const t = e.touches[0];
    const target = e.target as HTMLElement | null;
    const ignore = !!target?.closest(
      '.spaces-strip, .dms-tabs, .filter-tabs, .messages, .composer, .emoji-sheet-host, .sheet-host, .voice-room-screen, [data-no-swipe]'
    );
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now(), ignore };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.ignore) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dt > 600) return;
    const goingRight = dx > 0;
    const cur = navRef.current;
    const navIndex = NAV_ORDER.indexOf(cur.screen);
    if (navIndex >= 0) {
      const nextIdx = goingRight ? navIndex - 1 : navIndex + 1;
      if (nextIdx >= 0 && nextIdx < NAV_ORDER.length) {
        useChatStore.setState({ activeChannelId: null });
        useDMStore.setState({ activeDMPubkey: null });
        pushNav((n) => ({ ...n, screen: NAV_ORDER[nextIdx], baseScreen: null, msgContext: null }), goingRight ? 'back' : 'forward');
      }
      return;
    }
    if (goingRight && SUB_TO_NAV[cur.screen]) {
      window.history.back();
    }
  }, [pushNav]);
  const selectGroup = useCallback((groupId: string, kind: JsGroup['kind']) => {
    if (kind === 'voice' || kind === 'voice-sfu') {
      useChatStore.setState({ activeChannelId: null });
      pushNav((n) => ({ ...n, screen: 'voice-room', groupId }));
    } else if (kind === 'forum') {
      useChatStore.setState({ activeChannelId: null });
      pushNav((n) => ({ ...n, screen: 'forum', groupId, forumGroupId: groupId }));
    } else {
      useChatStore.setState({ activeChannelId: groupId, isNearBottom: true });
      const ns = useNotificationStore.getState();
      ns.clearChannelUnread(groupId);
      ns.clearChannelMention(groupId);
      pushNav((n) => ({ ...n, screen: 'channel', groupId }));
    }
  }, [pushNav]);
  const selectPeer = useCallback((peer: string) => {
    useDMStore.setState({ activeDMPubkey: peer });
    useNotificationStore.getState().clearDMUnread(peer);
    pushNav((n) => ({ ...n, screen: 'dm-thread', dmPeer: peer }));
  }, [pushNav]);
  const openProfile = useCallback((pubkey: string) => {
    pushNav((n) => ({ ...n, screen: 'profile-view', profilePubkey: pubkey }));
  }, [pushNav]);
  const openMembers = useCallback(() => {
    pushNav((n) => ({ ...n, screen: 'member-list' }));
  }, [pushNav]);
  const openMsgActions = useCallback((msg: { id: string; pubkey: string; content: string }) => {
    pushNav((n) => ({ ...n, baseScreen: n.screen, screen: 'msg-actions', msgContext: msg }));
  }, [pushNav]);
  const openZap = useCallback((msg: { id: string; pubkey: string; content: string }) => {
    pushNav((n) => ({ ...n, baseScreen: n.screen === 'msg-actions' ? n.baseScreen : n.screen, screen: 'zap-modal', msgContext: msg }));
  }, [pushNav]);
  const closeSheet = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);
  const backFromChannel = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);
  const backFromProfile = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);

  // Listen for reaction emit from msg-actions sheet
  useEffect(() => {
    const handler = async (e: Event) => {
      const ev = e as CustomEvent<{ msg: { id: string; pubkey: string }; emoji: string }>;
      const groupId = nav.groupId;
      if (!groupId) return;
      try {
        await nostrActions.sendReaction(ev.detail.msg.id, ev.detail.msg.pubkey, ev.detail.emoji, groupId);
      } catch (err) { console.warn('[mobile] react failed', err); }
    };
    window.addEventListener('obelisk-mobile:react', handler);
    return () => window.removeEventListener('obelisk-mobile:react', handler);
  }, [nav.groupId]);

  // ── DM and inbox badges ─────────────────────────────────────────────
  // Live unread DM total comes from the notification store, fed by the
  // bridge's DM ingestion path. Falls back to the 24h heuristic only when
  // the store is empty (e.g. before the first live DM arrives this session).
  const storeDmUnreads = useNotificationStore((s) => s.dmUnreads);
  const inboxBadge = useNotificationStore((s) => s.unreadInboxCount);
  const dmBadge = useMemo(() => {
    const fromStore = Object.values(storeDmUnreads).reduce((sum, n) => sum + n, 0);
    if (fromStore > 0) return fromStore;
    let n = 0;
    for (const msgs of Object.values(dms)) {
      const sorted = [...msgs].sort((a, b) => b.createdAt - a.createdAt);
      const latest = sorted[0];
      if (latest && !latest.outgoing && Date.now() / 1000 - latest.createdAt < 86400) n++;
    }
    return n;
  }, [dms, storeDmUnreads]);

  // ── render ──────────────────────────────────────────────────────────

  // Guests: full-screen login
  if (!isLoggedIn) {
    if (isRehydrating) {
      return (
        <div className="obelisk-mobile">
          <div className="screens-host">
            <RehydratingScreen />
          </div>
        </div>
      );
    }
    return (
      <div className="obelisk-mobile">
        <div className="screens-host">
          <LoginScreen />
        </div>
      </div>
    );
  }

  // Profile setup overlay
  if (showSetup) {
    return (
      <div className="obelisk-mobile">
        <div className="screens-host">
          <ProfileSetupScreen onDone={dismissSetup} onSkip={dismissSetup} />
        </div>
      </div>
    );
  }

  // pick screen
  let body: ReactNode;
  switch (nav.screen) {
    case 'server':
      body = <ServerScreen go={go} selectGroup={selectGroup} />;
      break;
    case 'channel':
      body = nav.groupId ? (
        <ChannelScreen
          groupId={nav.groupId}
          go={go}
          back={backFromChannel}
          openMsgActions={openMsgActions}
          openZap={openZap}
          openProfile={openProfile}
          openMembers={openMembers}
        />
      ) : <EmptyScreen go={go} title="No channel selected" />;
      break;
    case 'voice-room':
      body = nav.groupId ? (
        <VoiceRoomScreen
          groupId={nav.groupId}
          back={() => go('server', 'back')}
          openChat={() => { pushNav((n) => ({ ...n, screen: 'channel' })); }}
        />
      ) : <EmptyScreen go={go} title="No voice channel" />;
      break;
    case 'dms-list':
      body = <DmsListScreen go={go} selectPeer={selectPeer} myFollows={myFollows} />;
      break;
    case 'dm-thread':
      body = nav.dmPeer ? (
        <DmThreadScreen peer={nav.dmPeer} back={() => go('dms-list', 'back')} openProfile={openProfile} />
      ) : <EmptyScreen go={go} title="No conversation" />;
      break;
    case 'inbox':
      body = <InboxScreen go={go} selectGroup={selectGroup} selectPeer={selectPeer} />;
      break;
    case 'profile-view':
      body = nav.profilePubkey ? (
        <ProfileViewScreen pubkey={nav.profilePubkey} back={backFromProfile} openDm={selectPeer} />
      ) : <EmptyScreen go={go} title="No profile selected" />;
      break;
    case 'member-list':
      body = nav.groupId ? (
        <MemberListScreen groupId={nav.groupId} back={() => { if (typeof window !== 'undefined') window.history.back(); }} openProfile={openProfile} />
      ) : <EmptyScreen go={go} title="No channel" />;
      break;
    case 'compose-dm':
      body = <ComposeDmScreen back={() => go('dms-list', 'back')} selectPeer={selectPeer} />;
      break;
    case 'search':
      body = <SearchScreen back={() => go('server', 'back')} />;
      break;
    case 'forum':
      body = nav.groupId ? (
        <ForumScreen groupId={nav.groupId} back={() => go('server', 'back')} selectChild={(childId) => selectGroup(childId, 'text')} />
      ) : <EmptyScreen go={go} title="No forum" />;
      break;
    case 'settings-profile':
      body = <SettingsProfileScreen go={go} />;
      break;
    case 'settings-prefs':
      body = <SettingsPrefsScreen go={go} />;
      break;
    case 'msg-actions':
    case 'zap-modal':
      // sheets — handled below
      body = null;
      break;
    default:
      body = <EmptyScreen go={go} title="Unknown screen" />;
  }

  // Bottom nav visibility — hide on: channel composer focus (we don't track),
  // voice-room (full-bleed), profile-view, dm-thread (composer takes the bar
  // role), search/compose-dm/member-list (modal-ish flows), forum (back-nav).
  // Hide nav only when the screen owns the full viewport (voice-room takes
  // the whole stage; sheets float over the previous screen so the nav under
  // them stays meaningful but covered by the sheet backdrop).
  const hideNav = nav.screen === 'profile-view' || nav.screen === 'search' || nav.screen === 'compose-dm';

  // For sheets, render the underlying screen + the sheet
  let baseBody: ReactNode = null;
  if (nav.screen === 'msg-actions' || nav.screen === 'zap-modal') {
    if (nav.groupId) {
      baseBody = (
        <ChannelScreen
          groupId={nav.groupId}
          go={go}
          back={backFromChannel}
          openMsgActions={openMsgActions}
          openZap={openZap}
          openProfile={openProfile}
          openMembers={openMembers}
        />
      );
    } else {
      baseBody = <EmptyScreen go={go} title="Channel" />;
    }
  }

  const slideClass = slideDir === 'forward' ? 'slide-forward' : slideDir === 'back' ? 'slide-back' : '';
  return (
    <div className="obelisk-mobile" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="screens-host">
        {baseBody}
        <div key={nav.screen} className={`screen-anim ${slideClass}`}>{body}</div>
        {nav.screen === 'msg-actions' && nav.msgContext && (
          <MessageActionsSheet
            msg={nav.msgContext}
            close={closeSheet}
            onZap={() => openZap(nav.msgContext!)}
          />
        )}
        {nav.screen === 'zap-modal' && nav.msgContext && (
          <ZapModalSheet msg={nav.msgContext} close={closeSheet} />
        )}
      </div>
      {nav.screen !== 'voice-room' && (
        <div className="mobile-voice-status-slot"><VoiceStatusBar /></div>
      )}
      {!hideNav && <BottomNav active={nav.screen} go={go} dmBadge={dmBadge} inboxBadge={inboxBadge} />}
      {exitToast && (
        <div className="mobile-exit-toast" role="status" aria-live="polite">
          Press back again to exit
        </div>
      )}
    </div>
  );
}

function EmptyScreen({ go, title }: { go: (s: ScreenName) => void; title: string }) {
  return (
    <div className="screen active">
      <div className="empty-state">
        <div className="empty-state-title">{title}</div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => go('server')}>
          Back to home
        </button>
      </div>
    </div>
  );
}
