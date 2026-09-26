'use client';

import { displayNameFor } from '@/lib/display-name';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useChatStore } from '@/store/chat';
import { useGroupMemberInfo, useMyPubkey, useUserMetadata } from '@/lib/nostr-bridge';
import { useToastStore } from '@/store/toast';
import { formatPubkey, hexToNpub, hexToNpub as pubkeyToNpub } from '@nostr-wot/data';
import {
  replaceShortcodes,
  CUSTOM_EMOJI_PLACEHOLDER_REGEX,
} from '@/lib/emoji-shortcodes';
import WotBadge from './WotBadge';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/context';
import ProfileMenu from '@/components/social/ProfileMenu';
import { ICON_BUTTON_CLASS } from '@/components/ui/menu';
import { CheckBadgeIcon, CompassIcon, CopyIcon, EditIcon, GlobeIcon, MessageIcon, SettingsIcon, ZapIcon } from '@/components/ui/icons';
import { openSettings } from '@/lib/open-settings';

/** Bordered secondary button — white text, visible border (contrast rule). */
const SECONDARY_ACTION = 'flex items-center justify-center gap-2 rounded-full border border-lc-border bg-lc-card/60 px-3 py-2 text-xs font-semibold text-lc-white transition-colors hover:border-lc-green/50 hover:bg-lc-green/10';

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
        // eslint-disable-next-line @next/next/no-img-element
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

/** Colour per base role; the label is a key, resolved at render. */
const BASE_ROLE: Record<string, { key: string; color: string }> = {
  owner: { key: 'roles.base.owner', color: '#f59e0b' },
  admin: { key: 'roles.base.admin', color: '#ef4444' },
  mod: { key: 'roles.base.mod', color: '#3b82f6' },
  member: { key: 'roles.base.member', color: '#737373' },
};

export default function ProfilePopover({ pubkey, onClose, onExplore, onMessage }: {
  pubkey: string;
  onClose: () => void;
  onExplore: (pubkey: string) => void;
  onMessage?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const activeGroupId = useChatStore((s) => s.activeChannelId);
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const anchor = useChatStore((s) => s.profilePopupAnchor);
  const memberFromList = useGroupMemberInfo(activeGroupId).find((m) => m.pubkey === pubkey);
  // For arbitrary pubkeys (e.g. the search-bar dropdown), the active server's
  // memberList won't have an entry. Fall back to live Nostr kind:0 metadata so
  // the popover still renders avatar/name/nip05/about/website/lud16/banner.
  const meta = useUserMetadata(pubkey);
  const member = useMemo(() => {
    if (!memberFromList && !meta) return undefined;
    return {
      pubkey,
      displayName: meta?.displayName ?? meta?.name ?? memberFromList?.displayName ?? displayNameFor(pubkey),
      picture: meta?.picture ?? memberFromList?.picture,
      banner: meta?.banner ?? undefined,
      nip05: meta?.nip05 ?? memberFromList?.nip05,
      about: meta?.about ?? undefined,
      website: meta?.website ?? undefined,
      lud16: meta?.lud16 ?? undefined,
      role: memberFromList?.role,
    };
  }, [memberFromList, meta, pubkey]);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewerPubkey = useMyPubkey();
  const isSelf = viewerPubkey === pubkey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return;
    const panel = panelRef.current;
    const place = () => {
      const left = anchor.x + panel.offsetWidth + 12 <= window.innerWidth
        ? anchor.x + 12
        : Math.max(12, anchor.x - panel.offsetWidth - 12);
      const bottomEdge = window.innerHeight - 88;
      const top = anchor.y + panel.offsetHeight + 8 <= bottomEdge
        ? anchor.y + 8
        : Math.max(12, anchor.y - panel.offsetHeight - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(panel);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor]);

  let npub = '';
  try { npub = hexToNpub(pubkey); } catch {}
  // Never the raw 64-char hex: when bech32 encoding threw, this popover
  // printed the whole pubkey as the person's name.
  const displayName = member?.displayName || displayNameFor(pubkey);
  const npubShort = npub ? shortNpub(pubkey) : pubkey;
  const baseRole = member?.role ? BASE_ROLE[member.role] : undefined;
  const zap = () => {
    const channelId = useChatStore.getState().activeChannelId;
    if (!channelId) return;
    window.dispatchEvent(new CustomEvent('obelisk:zap-prefill', { detail: { pubkey, displayName } }));
    onClose();
  };
  return (
    <div
      className={`fixed inset-0 z-[100] flex p-4 ${anchor ? 'items-start justify-start bg-transparent' : 'items-center justify-center bg-black/60'}`}
      onClick={onClose}
      data-testid="profile-popover-backdrop"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-lc-dark border border-lc-border rounded-xl shadow-2xl"
        style={anchor ? { position: 'fixed' } : undefined}
        data-testid="profile-popover"
        role="dialog"
      >
        {/* Banner */}
        <div
          className="h-24 w-full rounded-t-xl bg-gradient-to-br from-lc-olive to-lc-black"
          style={
            member?.banner
              ? { backgroundImage: `url(${member.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
          data-testid="profile-banner"
        />

        {/* Avatar overlaps the banner; the action cluster sits on the banner's
            lower edge opposite it, so name and handle get the full width. */}
        <div className="relative px-4" data-testid="profile-name-row">
          <div className="absolute -top-10 left-4">
            <UserAvatar
              pubkey={pubkey}
              picture={member?.picture ?? null}
              size={20}
              name={displayName || '?'}
              alt={displayName}
              className="border-4 border-lc-dark"
              initialClassName="text-2xl"
            />
          </div>
          <div className="flex justify-end gap-1.5 pt-2.5">
            {!isSelf && (
              <button
                type="button"
                onClick={zap}
                className={`${ICON_BUTTON_CLASS} h-8 w-8 text-lc-green`}
                aria-label={t('profilePopover.zap')}
                title={t('profilePopover.zap')}
                data-testid="profile-zap-btn"
              >
                <ZapIcon size={16} fill="currentColor" />
              </button>
            )}
            <ProfileMenu
              pubkey={pubkey}
              displayName={displayName}
              canModerate={!isSelf}
              size="sm"
            />
          </div>
        </div>

        <div className="space-y-3 px-4 pb-4 pt-4">
          {/* Identity */}
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 break-words text-lg font-semibold leading-tight text-lc-white" data-testid="profile-name">
              <span>{renderWithEmojis(displayName, serverEmojis)}</span>
              <WotBadge pubkey={pubkey} />
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs" data-testid="profile-handle">
              {member?.nip05 && (
                <span className="flex min-w-0 items-center gap-1 text-lc-green" title={member.nip05}>
                  <CheckBadgeIcon size={14} />
                  <span className="truncate">{member.nip05.replace(/^_@/, '')}</span>
                </span>
              )}
              {npub ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(npub).catch(() => {});
                    useToastStore.getState().pushToast({ title: t('profileFeed.npubCopied'), body: npubShort });
                  }}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-lc-border bg-lc-black/60 px-2 py-0.5 font-mono text-[11px] text-lc-white/85 transition-colors hover:border-lc-green/50 hover:text-lc-white"
                  title={t('profileFeed.copyNpub')}
                  data-testid="profile-copy-npub-btn"
                >
                  <span className="truncate">{npubShort}</span>
                  <CopyIcon size={12} />
                </button>
              ) : null}
            </div>
          </div>

          {member?.about && (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-lc-white/85" data-testid="profile-about">
              {renderWithEmojis(member.about, serverEmojis)}
            </p>
          )}

          {/* Roles + links, recessed so they read as details, not actions. */}
          {(baseRole || member?.website || member?.lud16) && (
            <div className="space-y-2.5 rounded-lg border border-lc-border bg-lc-black/50 p-3">
              {baseRole && (
                <div className="flex flex-wrap items-center gap-1.5" data-testid="profile-roles">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{t('profilePopover.roles')}</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: baseRole.color, color: baseRole.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: baseRole.color }} />
                    {t(baseRole.key)}
                  </span>
                </div>
              )}
              {(member?.website || member?.lud16) && (
                <div className="space-y-1.5" data-testid="profile-links">
                  {member?.website && (
                    <a
                      href={/^https?:\/\//i.test(member.website) ? member.website : `https://${member.website}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center gap-2 truncate text-xs text-lc-green hover:underline"
                      data-testid="profile-website"
                    >
                      <GlobeIcon size={14} />
                      {member.website.replace(/^https?:\/\//i, '')}
                    </a>
                  )}
                  {member?.lud16 && (
                    <div className="flex items-center gap-2 break-all text-xs text-lc-white/85" data-testid="profile-lud16">
                      <span className="text-lc-green"><ZapIcon size={14} /></span>
                      {member.lud16}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 border-t border-lc-border pt-3" data-testid="profile-compact-actions">
            {isSelf ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { onClose(); openSettings('profile'); }}
                  className={SECONDARY_ACTION}
                  data-testid="profile-edit-btn"
                >
                  <EditIcon size={15} /> {t('settings.editProfile')}
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); openSettings('general'); }}
                  className={SECONDARY_ACTION}
                  data-testid="profile-preferences-btn"
                >
                  <SettingsIcon size={15} /> {t('settings.openPreferences')}
                </button>
              </div>
            ) : onMessage && (
              <button
                type="button"
                className={`${SECONDARY_ACTION} w-full`}
                onClick={() => {
                  onClose();
                  onMessage(pubkey);
                }}
                data-testid="profile-message-btn"
              >
                <MessageIcon size={15} /> {t('mobile.profile.message')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onExplore(pubkey);
              }}
              className="lc-pill-primary flex w-full items-center justify-center gap-2 text-xs"
              data-testid="profile-explore-btn"
            >
              <CompassIcon size={15} /> {t('profileFeed.explore')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
