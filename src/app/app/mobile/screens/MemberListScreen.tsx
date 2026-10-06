'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { avatarStyle } from '../avatar';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useCallback, useMemo } from 'react';
import {
  useGroups,
  useUserMetadata,
  useAdmins,
  useMembers,
  useMembershipReady,
  useCurrentRelayUrl,
} from '@/services/nostr-bridge';
import RoleBadge from '@/components/chat/RoleBadge';
import { type RelayRole } from '@/services/relay-roles';
import { useTranslation } from '@/i18n/context';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey, useNostrPresence, PRESENCE_WINDOW_MS } from '@/hooks/chat/useNostrPresence';
import { channelHeaderLabel } from '../labels';
import BackButton from '../BackButton';
import RemoteImage from '@/components/ui/RemoteImage';

export function MemberListScreen({ groupId, back, openProfile }: { groupId: string; back: () => void; openProfile: (p: string) => void }) {
  const { t } = useTranslation();
  const groups = useGroups();
  const relayUrl = useCurrentRelayUrl();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const parentGroup = group?.parent ? groups.find((g) => g.id === group.parent) ?? null : null;
  const header = channelHeaderLabel(group, parentGroup, groupId);
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const membershipReady = useMembershipReady(groupId);

  const adminSet = useMemo(() => new Set(admins), [admins]);
  const nonAdminMembers = useMemo(() => members.filter((m) => !adminSet.has(m)), [members, adminSet]);
  const memberRoles = useChatStore((s) => s.rolesByPubkey);

  // Same ladder as the desktop rail: admins, then a section per relay role in
  // tier order, then everyone holding no role.
  const rankedSections = useMemo(() => {
    const byRole = new Map<string, { role: RelayRole; pubkeys: string[] }>();
    const plain: string[] = [];
    for (const pubkey of nonAdminMembers) {
      const top = memberRoles[pubkey]?.[0];
      if (!top) {
        plain.push(pubkey);
        continue;
      }
      const bucket = byRole.get(top.id) ?? { role: top, pubkeys: [] };
      bucket.pubkeys.push(pubkey);
      byRole.set(top.id, bucket);
    }
    const ranked = Array.from(byRole.values())
      .sort((a, b) => (b.role.tier - a.role.tier) || a.role.id.localeCompare(b.role.id))
      .map(({ role, pubkeys }) => ({
        key: role.id,
        label: role.emoji ? `${role.emoji} ${role.name}` : role.name,
        pubkeys,
      }));
    return [...ranked, { key: 'member', label: t('mobile.members.members'), pubkeys: plain }]
      .filter((section) => section.pubkeys.length > 0);
  }, [memberRoles, nonAdminMembers, t]);

  const allPubkeys = useMemo(() => {
    const set = new Set<string>([...admins, ...members]);
    return [...set];
  }, [admins, members]);
  useNostrPresence(allPubkeys, relayUrl);
  // presenceTick re-renders the list on the offline-fade timer.
  useChatStore((s) => s.presenceTick);
  const lastActivityAt = useChatStore((s) => s.lastActivityAt);

  const isOnline = useCallback(
    (pubkey: string) => {
      const at = lastActivityAt[presenceActivityKey(relayUrl, pubkey)];
      return !!at && at >= Date.now() - PRESENCE_WINDOW_MS;
    },
    [lastActivityAt, relayUrl],
  );

  const onlineCount = useMemo(
    () => allPubkeys.reduce((n, pk) => (isOnline(pk) ? n + 1 : n), 0),
    [allPubkeys, isOnline],
  );

  return (
    <div className="screen member-list-screen active" data-screen="member-list">
      <div className="chat-header chat-header-compact">
        <div className="chat-row">
          <div className="chat-title-block">
            <BackButton onClick={back} />
            <div className="chat-channel"><span className="hash">#</span>{header.channel} · {t('mobile.members.label')}</div>
          </div>
          <div className="member-presence-count">{onlineCount}/{allPubkeys.length}</div>
        </div>
      </div>
      <div className="search-body">
        {admins.length > 0 && (
          <>
            <div className="member-section-label" data-testid="member-section-admin">{t('mobile.members.admins')} · {admins.length}</div>
            {admins.map((p) => <MemberRow key={p} pubkey={p} role="admin" online={isOnline(p)} onClick={() => openProfile(p)} />)}
          </>
        )}
        {rankedSections.map((section) => (
          <div key={section.key} data-testid={`member-section-${section.key}`}>
            <div className="member-section-label">{section.label} · {section.pubkeys.length}</div>
            {section.pubkeys.map((p) => <MemberRow key={p} pubkey={p} online={isOnline(p)} onClick={() => openProfile(p)} />)}
          </div>
        ))}
        {members.length === 0 && admins.length === 0 && !membershipReady && (
          <div
            className="empty-state"
            data-testid="members-loading"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
          >
            <div className="lc-spinner" aria-hidden="true" />
            <div className="empty-state-title">{t('mobile.members.loading')}</div>
          </div>
        )}
        {members.length === 0 && admins.length === 0 && membershipReady && (
          <div className="empty-state">
            <div className="empty-state-title">{t('mobile.members.empty')}</div>
            <div className="empty-state-desc">{t('mobile.members.emptyDescription')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ pubkey, role, online, onClick }: { pubkey: string; role?: 'admin'; online: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const name = displayNameFor(pubkey, meta);
  return (
    <button className="member-row" onClick={onClick}>
      <div className={`dm-ava-list ${online ? '' : 'offline'}`} style={{ ...avatarStyle(pubkey), width: 36, height: 36, fontSize: 12 }}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, pubkey)}
      </div>
      <div className="member-row-meta">
        <span className="member-row-name">{name}</span>
        <span className="member-row-nip">{meta?.nip05 ?? shortNpubLabel(pubkey)}</span>
      </div>
      <RoleBadge pubkey={pubkey} />
      {role === 'admin' && <span className="role-badge b-core">{t('mobile.members.admin')}</span>}
      <span className={`member-row-presence ${online ? 'on' : 'off'}`} />
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11 - compose DM (search + open thread)
