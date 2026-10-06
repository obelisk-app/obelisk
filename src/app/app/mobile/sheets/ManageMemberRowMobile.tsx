'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { avatarStyle } from '../avatar';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useUserMetadata } from '@/services/nostr-bridge';
import { useManageMemberRow } from '@/hooks/chat/useManageMemberRow';
import { useTranslation } from '@/i18n/context';
import RemoteImage from '@/components/ui/RemoteImage';

export function ManageMemberRowMobile({
  groupId,
  pubkey,
  isAdmin,
}: {
  groupId: string;
  pubkey: string;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const name = displayNameFor(pubkey, meta);
  // Inline confirm rather than `window.confirm`: a native dialog on mobile
  // covers the sheet and names the person out of context.
  const { confirming, ask, cancel, confirmPending } = useManageMemberRow(groupId, pubkey);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    background: 'var(--app-surface)',
    border: '1px solid var(--app-line)',
    borderRadius: 12,
  };

  if (confirming) {
    const demoting = confirming === 'demote';
    return (
      <div style={rowStyle} data-testid={`mobile-member-confirm-${pubkey}`}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--app-text)' }}>
          {demoting
            ? `Demote ${name}? They keep channel access but lose admin rights.`
            : `Kick ${name} from this channel?`}
        </span>
        <button
          type="button"
          onClick={cancel}
          style={{ border: '1px solid var(--app-line)', borderRadius: 8, padding: '4px 8px', background: 'transparent', color: 'var(--app-text-dim)', fontSize: 11 }}
          data-testid={`mobile-member-confirm-cancel-${pubkey}`}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={confirmPending}
          style={{
            border: '1px solid var(--app-line)',
            borderRadius: 8,
            padding: '4px 8px',
            background: demoting ? 'var(--app-surface)' : 'var(--presence-dnd, #ef4444)',
            color: demoting ? 'var(--app-text)' : '#fff',
            fontSize: 11,
            fontWeight: 600,
          }}
          data-testid={`mobile-member-confirm-ok-${pubkey}`}
        >
          {demoting ? 'Demote' : 'Kick'}
        </button>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <div className="msg-ava" style={{ ...avatarStyle(pubkey), width: 32, height: 32 }}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, pubkey)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
          {isAdmin && (
            <span style={{
              marginLeft: 6,
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'var(--accent-soft)',
              border: '1px solid rgba(180, 249, 83, 0.4)',
              borderRadius: 999,
              padding: '1px 6px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>admin</span>
          )}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--app-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortNpubLabel(pubkey)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {isAdmin && (
          <button
            type="button"
            onClick={() => ask('demote')}
            style={{
              border: '1px solid var(--app-line)',
              borderRadius: 8,
              padding: '4px 8px',
              background: 'transparent',
              color: 'var(--app-text-dim)',
              fontSize: 11,
            }}
            aria-label={`Demote ${name}`}
          >
            {t('mobile.members.demote')}
          </button>
        )}
        <button
          type="button"
          onClick={() => ask('remove')}
          style={{
            border: '1px solid var(--app-line)',
            borderRadius: 8,
            padding: '4px 8px',
            background: 'transparent',
            color: 'var(--presence-dnd, #ef4444)',
            fontSize: 11,
          }}
          aria-label={`Kick ${name}`}
        >
          {t('mobile.members.kick')}
        </button>
      </div>
    </div>
  );
}
