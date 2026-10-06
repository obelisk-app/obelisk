'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { useState } from 'react';
import { nostrActions, useConfiguredRelays, type JsGroup } from '@/services/nostr-bridge';
import { type ChannelLayout } from '@/services/channel-layout';
import { type RelayBranding } from '@/services/relay-branding';
import { type RelayEmojiSet } from '@/services/relay-emojis';
import RelayAdminPanel from '@/components/admin/RelayAdminPanel';
import RelayEmojiAdminModal from '@/components/admin/RelayEmojiAdminModal';
import RelayRolesAdminModal from '@/components/admin/RelayRolesAdminModal';
import { type RelayRoles } from '@/services/relay-roles';
import { useTranslation } from '@/i18n/context';
import { confirmDialog } from '@/services/confirm-dialog';
import { avatarStyle } from '../avatar';
import { EditBrandingSheet } from './EditBrandingSheet';
import { ManageCategoriesSheet } from './ManageCategoriesSheet';
import Sheet from '@/components/ui/Sheet';
import SheetActions from './SheetActions';
import RemoteImage from '@/components/ui/RemoteImage';

const rowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 12px',
  background: 'var(--app-surface)',
  border: '1px solid var(--app-line)',
  borderRadius: 12,
  color: 'var(--app-text)',
  textAlign: 'left',
  cursor: 'pointer',
};

/**
 * One menu row. Defined at module scope on purpose: declared inside the
 * sheet, it was a new component type on every render, so React unmounted
 * and remounted every row (fresh DOM nodes, focus lost) each time the sheet
 * re-rendered, which it does on every busy-hint and toast change.
 */
function Row({
  icon,
  rowLabel,
  hint,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  rowLabel: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...rowStyle, color: danger ? 'var(--presence-dnd, #ef4444)' : rowStyle.color }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{rowLabel}</span>
      </span>
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--app-text-mute)' }}>{hint}</span>
      )}
    </button>
  );
}

export function RelayMenuSheet({
  close,
  relayUrl,
  label,
  iconUrl,
  isAdmin = false,
  branding,
  emojiSet,
  roles,
  layout,
  rootChannels,
}: {
  close: () => void;
  relayUrl: string;
  label: string;
  iconUrl?: string | null;
  isAdmin?: boolean;
  branding?: RelayBranding;
  emojiSet?: RelayEmojiSet;
  roles?: RelayRoles;
  layout?: ChannelLayout;
  rootChannels?: ReadonlyArray<JsGroup>;
}) {
  const { t } = useTranslation();
  const relays = useConfiguredRelays();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [adminPanel, setAdminPanel] = useState<null | 'branding' | 'emojis' | 'categories' | 'members' | 'roles'>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1600);
  };

  const inviteText = `Join ${label} on Obelisk: ${relayUrl}`;

  const invite = async () => {
    setBusy('invite');
    try {
      await navigator.clipboard?.writeText(inviteText);
      flash('Invite copied');
    } catch { /* ignore */ }
    finally { setBusy(null); }
  };

  const share = async () => {
    setBusy('share');
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (typeof nav.share === 'function') {
        await nav.share({ title: label, text: inviteText, url: relayUrl });
      } else {
        await navigator.clipboard?.writeText(inviteText);
        flash('Copied to clipboard');
      }
    } catch { /* user cancelled or unsupported */ }
    finally { setBusy(null); }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard?.writeText(relayUrl);
      flash('Relay URL copied');
    } catch { /* ignore */ }
  };

  const leave = async () => {
    const ok = await confirmDialog({
      title: t('mobile.relay.confirmLeave').replace('{name}', label),
      message: t('rail.confirmRemoveBody'),
      confirmLabel: t('confirm.leave'),
      icon: 'leave',
    });
    if (!ok) return;
    setBusy('leave');
    try {
      const others = relays.filter((u) => u !== relayUrl);
      await nostrActions.removeRelay(relayUrl);
      if (others.length > 0) await nostrActions.switchRelay(others[0]);
      close();
    } catch (err) {
      console.warn('[mobile] leave relay failed', err);
    } finally { setBusy(null); }
  };

  const stackedPanels = (
    <>
      {adminPanel === 'branding' && branding && (
        <EditBrandingSheet
          relayUrl={relayUrl}
          branding={branding}
          close={() => setAdminPanel(null)}
        />
      )}
      {adminPanel === 'emojis' && emojiSet && (
        <RelayEmojiAdminModal
          relayUrl={relayUrl}
          emojiSet={emojiSet}
          configuredRelays={relays}
          onClose={() => setAdminPanel(null)}
        />
      )}
      {adminPanel === 'categories' && layout && (
        <ManageCategoriesSheet
          relayUrl={relayUrl}
          layout={layout}
          channels={rootChannels ?? []}
          close={() => setAdminPanel(null)}
        />
      )}
      {adminPanel === 'members' && (
        <RelayAdminPanel onClose={() => setAdminPanel(null)} />
      )}
      {adminPanel === 'roles' && roles && (
        <RelayRolesAdminModal
          relayUrl={relayUrl}
          roles={roles}
          onClose={() => setAdminPanel(null)}
        />
      )}
    </>
  );

  return (
    <Sheet onClose={close} screen="relay-menu" label={label} maxHeight="88%" stacked={stackedPanels}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 4px 14px' }}>
        <div className="space-icon" style={{ width: 44, height: 44, ...(iconUrl ? {} : avatarStyle(relayUrl)) }}>
          {iconUrl ? <RemoteImage src={iconUrl} alt="" /> : shortHost(relayUrl).slice(0, 1).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--app-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortHost(relayUrl)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>}
          rowLabel={t('mobile.space.invite')}
          hint={busy === 'invite' ? '…' : 'copy link'}
          onClick={() => void invite()}
        />
        <Row
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>}
          rowLabel={t('mobile.space.share')}
          hint={busy === 'share' ? '…' : undefined}
          onClick={() => void share()}
        />
        <Row
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
          rowLabel={t('mobile.space.copyUrl')}
          onClick={() => void copyUrl()}
        />
        {isAdmin && (
          <>
            <div
              data-testid="mobile-relay-admin-section"
              style={{
                marginTop: 6,
                padding: '0 4px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--app-text-mute)',
              }}
            >
              {t('mobile.members.admin')}
            </div>
            <Row
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>}
              rowLabel={t('mobile.branding.edit')}
              hint={t('mobile.branding.hint')}
              onClick={() => setAdminPanel('branding')}
            />
            <Row
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>}
              rowLabel={t('mobile.settings.packs')}
              hint="NIP-51"
              onClick={() => setAdminPanel('emojis')}
            />
            <Row
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>}
              rowLabel={t('mobile.layout.title')}
              hint={t('mobile.space.layoutHint')}
              onClick={() => setAdminPanel('categories')}
            />
            <Row
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 9.5 8 4 9l4 4-1 6 5-3 5 3-1-6 4-4-5.5-1z" /></svg>}
              rowLabel={t('mobile.space.roles')}
              hint={t('mobile.space.rolesHint')}
              onClick={() => setAdminPanel('roles')}
            />
            <Row
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
              rowLabel={t('mobile.space.people')}
              hint={t('mobile.space.peopleHint')}
              onClick={() => setAdminPanel('members')}
            />
          </>
        )}
        <Row
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>}
          rowLabel={t('mobile.space.leave')}
          hint={busy === 'leave' ? '…' : undefined}
          danger
          onClick={() => void leave()}
        />
      </div>
      {toast && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent, #b4f953)', textAlign: 'center' }}>{toast}</div>
      )}
      <SheetActions onCancel={close} dismiss="close" cancelClassName="relay-menu-close" />
    </Sheet>
  );
}
