'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { useSuggestedRelayItem } from '@/hooks/relay/rail/useSuggestedRelayItem';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One suggested relay: its icon, name, host and description, and an Add pill. */
export function SuggestedRelayItem({
  url,
  alreadyAdded,
  onAdded,
}: {
  url: string;
  alreadyAdded: boolean;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const { host, name, description, icon, onIconError, busy, error: err, add } = useSuggestedRelayItem(url, alreadyAdded, onAdded);

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
      <div className="space-icon" style={{ width: 44, height: 44, ...(icon ? {} : avatarStyle(url)) }}>
        {icon ? (
          <RemoteImage src={icon} alt="" onError={onIconError} />
        ) : (
          host.slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--app-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</div>
        {description && (
          <div style={{ fontSize: 11.5, color: 'var(--app-text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {description}
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: 'var(--presence-dnd)', marginTop: 2 }}>{err}</div>}
      </div>
      <Button
        variant="bare"
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
        {alreadyAdded ? t('mobile.rail.added') : busy ? '…' : t('mobile.rail.add')}
      </Button>
    </div>
  );
}
