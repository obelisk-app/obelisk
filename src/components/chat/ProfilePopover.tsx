'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useChatStore } from '@/store/chat';
import { formatPubkey } from '@/lib/nostr';
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
    const npub = nip19.npubEncode(pubkey);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const displayName = member?.displayName || formatPubkey(pubkey);
  const npubShort = shortNpub(pubkey);
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
          className="h-24 w-full bg-gradient-to-br from-lc-olive to-lc-black"
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

          {/* Joined date */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1">
              Miembro desde
            </div>
            <div className="text-sm text-lc-white/90" data-testid="profile-joined">
              {formatJoinedDate(member?.joinedAt)}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
