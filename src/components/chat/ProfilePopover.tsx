'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useChatStore } from '@/store/chat';
import { useToastStore } from '@/store/toast';
import { useModerationStore } from '@/store/moderation';
import { useAuthStore } from '@/store/auth';
import { formatPubkey, pubkeyToNpub } from '@/lib/nostr';
import { nip19 } from 'nostr-tools';
import {
  replaceShortcodes,
  CUSTOM_EMOJI_PLACEHOLDER_REGEX,
} from '@/lib/emoji-shortcodes';
import ChannelEmoji from './ChannelEmoji';

function renderWithEmojis(text: string, serverEmojis: Record<string, string>): ReactNode {
  if (!text) return text;
  const resolved = replaceShortcodes(text, serverEmojis);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  const re = new RegExp(CUSTOM_EMOJI_PLACEHOLDER_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(resolved)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t${i}`}>{resolved.slice(lastIndex, match.index)}</Fragment>);
    }
    const name = match[1];
    const url = serverEmojis[name];
    if (url) {
      nodes.push(
        <img
          key={`e${i}`}
          src={url}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="inline-block w-[1.1em] h-[1.1em] align-[-0.15em] object-contain"
        />,
      );
    }
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < resolved.length) {
    nodes.push(<Fragment key={`t${i}`}>{resolved.slice(lastIndex)}</Fragment>);
  }
  return nodes.length ? nodes : resolved;
}

function shortNpub(pubkey: string): string {
  try {
    const npub = pubkeyToNpub(pubkey);
    return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  } catch {
    return formatPubkey(pubkey);
  }
}

function formatJoinedDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

const BASE_ROLE_LABEL: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: '#f59e0b' },
  admin: { label: 'Admin', color: '#ef4444' },
  mod: { label: 'Moderador', color: '#3b82f6' },
  member: { label: 'Miembro', color: '#737373' },
};

export default function ProfilePopover({ pubkey, onClose }: {
  pubkey: string;
  onClose: () => void;
}) {
  const { memberList, serverEmojis } = useChatStore();
  const member = memberList.find((m) => m.pubkey === pubkey);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewerPubkey = useAuthStore((s) => s.user?.pubkey);
  const isSelf = viewerPubkey === pubkey;
  const muted = useModerationStore((s) => s.mutedPubkeys.includes(pubkey));
  const blocked = useModerationStore((s) => s.blockedPubkeys.includes(pubkey));
  const toggleMute = useModerationStore((s) => s.toggleMute);
  const toggleBlock = useModerationStore((s) => s.toggleBlock);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  let npub = '';
  try { npub = nip19.npubEncode(pubkey); } catch {}
  const isBot = !!member?.isBot || !npub;
  const safeFallback = npub ? formatPubkey(pubkey) : pubkey;
  const displayName = member?.displayName || safeFallback;
  const npubShort = npub ? shortNpub(pubkey) : pubkey;
  const baseRole = member?.role ? BASE_ROLE_LABEL[member.role] : undefined;
  const customRoles = (member?.customRoles ?? []).slice().sort((a, b) => b.priority - a.priority);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="profile-popover-backdrop"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto bg-lc-dark border border-lc-border rounded-xl shadow-2xl"
        data-testid="profile-popover"
        role="dialog"
      >
        {/* Banner */}
        <div
          className="h-20 w-full bg-gradient-to-br from-lc-olive to-lc-black rounded-t-xl"
          style={
            member?.banner
              ? { backgroundImage: `url(${member.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
          data-testid="profile-banner"
        />

        {/* Avatar (overlaps banner) */}
        <div className="relative px-4">
          <div className="absolute -top-10 left-4">
            {member?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.picture}
                alt={displayName}
                className="w-20 h-20 rounded-full object-cover border-4 border-lc-dark bg-lc-dark"
                data-testid="profile-avatar"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full border-4 border-lc-dark bg-lc-olive flex items-center justify-center text-lc-green text-2xl font-semibold"
                data-testid="profile-avatar-fallback"
              >
                {displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
        </div>

        <div className="pt-12 pb-4 px-4 space-y-3">
          {/* Name + handle */}
          <div>
            <h3 className="text-lg font-semibold text-lc-white break-words" data-testid="profile-name">
              {renderWithEmojis(displayName, serverEmojis)}
            </h3>
            <div className="text-xs text-lc-muted break-all" data-testid="profile-handle">
              {member?.nip05 || npubShort}
            </div>
          </div>

          {/* About */}
          {member?.about && (
            <p className="text-sm text-lc-white/80 whitespace-pre-wrap break-words" data-testid="profile-about">
              {renderWithEmojis(member.about, serverEmojis)}
            </p>
          )}

          {/* Roles */}
          {(baseRole || customRoles.length > 0) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1.5">
                Roles
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="profile-roles">
                {baseRole && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                    style={{ borderColor: baseRole.color, color: baseRole.color }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: baseRole.color }}
                    />
                    {baseRole.label}
                  </span>
                )}
                {customRoles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-lc-black/40"
                    style={{ borderColor: r.color, color: r.color }}
                    data-testid="profile-custom-role"
                  >
                    {r.icon ? (
                      <ChannelEmoji value={r.icon} imgClassName="inline-block w-3.5 h-3.5 object-contain" className="text-sm" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                    )}
                    {renderWithEmojis(r.name, serverEmojis)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact / links */}
          {(member?.website || member?.lud16) && (
            <div className="space-y-1.5" data-testid="profile-links">
              {member?.website && (
                <a
                  href={/^https?:\/\//i.test(member.website) ? member.website : `https://${member.website}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-2 text-xs text-lc-green hover:underline break-all"
                  data-testid="profile-website"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  {member.website.replace(/^https?:\/\//i, '')}
                </a>
              )}
              {member?.lud16 && (
                <div
                  className="flex items-center gap-2 text-xs text-lc-white/80 break-all"
                  data-testid="profile-lud16"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-lc-green">
                    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                  </svg>
                  {member.lud16}
                </div>
              )}
            </div>
          )}

          {/* Joined date */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1">
              Miembro desde
            </div>
            <div className="text-sm text-lc-white/90" data-testid="profile-joined">
              {formatJoinedDate(member?.joinedAt)}
            </div>
          </div>

          {/* Bot status text */}
          {isBot && member?.statusText && (
            <div
              className="text-xs text-lc-green font-mono break-words"
              data-testid="profile-bot-status"
            >
              {member.statusText}
            </div>
          )}

          {/* Actions */}
          {!isBot && (
          <div className="pt-3 border-t border-lc-border space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const channelId = useChatStore.getState().activeChannelId;
                  if (!channelId) return;
                  window.dispatchEvent(new CustomEvent('obelisk:zap-prefill', {
                    detail: { pubkey, displayName },
                  }));
                  onClose();
                }}
                className="lc-pill-primary text-xs flex-1"
                data-testid="profile-zap-btn"
              >
                ⚡ Zapear
              </button>
              {npub && (
                <>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(npub).catch(() => {});
                      useToastStore.getState().pushToast({
                        title: 'npub copiado',
                        body: `${npub.slice(0, 12)}…${npub.slice(-6)}`,
                      });
                    }}
                    className="lc-pill-secondary text-xs"
                    title="Copiar npub"
                    data-testid="profile-copy-npub-btn"
                  >
                    Copiar npub
                  </button>
                  <a
                    href={`https://njump.me/${npub}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lc-pill-secondary text-xs flex items-center justify-center"
                    title="Abrir en otro cliente Nostr (njump.me)"
                    data-testid="profile-open-nostr-btn"
                  >
                    Nostr ↗
                  </a>
                </>
              )}
            </div>
            {!isSelf && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const nowMuted = toggleMute(pubkey);
                    useToastStore.getState().pushToast({
                      title: nowMuted ? 'Usuario silenciado' : 'Silencio quitado',
                      body: nowMuted
                        ? `Ya no verás notificaciones de ${displayName}`
                        : `Volverás a recibir notificaciones de ${displayName}`,
                    });
                  }}
                  className={`text-xs flex-1 px-3 py-1.5 rounded-full border transition-colors ${
                    muted
                      ? 'border-lc-green/60 text-lc-green bg-lc-green/10 hover:bg-lc-green/20'
                      : 'border-lc-border text-lc-muted hover:text-lc-white hover:border-lc-white/40'
                  }`}
                  data-testid="profile-mute-btn"
                  title="Silenciar notificaciones de este usuario (solo en este dispositivo)"
                >
                  {muted ? '🔕 Silenciado' : '🔕 Silenciar'}
                </button>
                <button
                  onClick={() => {
                    if (!blocked && !window.confirm(`¿Bloquear a ${displayName}? Sus mensajes quedarán ocultos en este dispositivo.`)) {
                      return;
                    }
                    const nowBlocked = toggleBlock(pubkey);
                    useToastStore.getState().pushToast({
                      title: nowBlocked ? 'Usuario bloqueado' : 'Bloqueo quitado',
                      body: nowBlocked
                        ? `Los mensajes de ${displayName} quedarán ocultos`
                        : `Volverás a ver los mensajes de ${displayName}`,
                    });
                    if (nowBlocked) onClose();
                  }}
                  className={`text-xs flex-1 px-3 py-1.5 rounded-full border transition-colors ${
                    blocked
                      ? 'border-red-500/60 text-red-400 bg-red-500/10 hover:bg-red-500/20'
                      : 'border-lc-border text-lc-muted hover:text-red-400 hover:border-red-500/40'
                  }`}
                  data-testid="profile-block-btn"
                  title="Ocultar los mensajes de este usuario (solo en este dispositivo)"
                >
                  {blocked ? '🚫 Bloqueado' : '🚫 Bloquear'}
                </button>
              </div>
            )}
            {!isSelf && (muted || blocked) && (
              <p className="text-[10px] text-lc-muted leading-snug">
                {blocked
                  ? 'Bloqueo local: oculta los mensajes de este usuario solo en este dispositivo. El usuario no recibe notificación.'
                  : 'Silencio local: suprime menciones y notificaciones solo en este dispositivo.'}
              </p>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
