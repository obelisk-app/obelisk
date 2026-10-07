'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { useEffect, useId, useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';
import { faviconFor, fetchRelayInfo, SUGGESTED_RELAYS } from '@/services/relay/relay-info';
import { useAddRelayForm, useSuggestedRelayAdd } from '@/hooks/relay/useAddRelayForm';
import { useTranslations } from 'next-intl';
import { avatarStyle } from '../../common/avatar';
import Sheet from '@/components/ui/overlays/Sheet';
import Input from '@/components/ui/forms/Input';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';
import RemoteImage from '@/components/ui/media/RemoteImage';

export function AddRelaySheet({ close }: { close: () => void }) {
  const t = useTranslations();
  const [tab, setTab] = useState<'suggested' | 'custom'>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);

  return (
    <Sheet onClose={close} screen="add-relay" label={t('mobile.rail.addTitle')} maxHeight="88%">
      <SheetHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
        title={t('mobile.rail.addTitle')}
      />
      <div className="dms-tabs native-scroll-x" style={{ padding: 0 }}>
        <button className={`filter-tab ${tab === 'suggested' ? 'active' : ''}`} onClick={() => setTab('suggested')}>
          {t('shell.rail.addModal.suggested')}
        </button>
        <button className={`filter-tab ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>
          {t('shell.rail.addModal.custom')}
        </button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '54vh', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
        {tab === 'suggested' ? (
          SUGGESTED_RELAYS.map((r) => (
            <SuggestedRelayItem
              key={r.url}
              url={r.url}
              alreadyAdded={configuredSet.has(r.url)}
              onAdded={close}
            />
          ))
        ) : (
          <CustomRelayForm onAdded={close} />
        )}
      </div>
      <SheetActions onCancel={close} dismiss="close" />
    </Sheet>
  );
}

function SuggestedRelayItem({
  url,
  alreadyAdded,
  onAdded,
}: {
  url: string;
  alreadyAdded: boolean;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const [name, setName] = useState<string>(shortHost(url));
  const [description, setDescription] = useState<string>('');
  const { busy, error: err, add } = useSuggestedRelayAdd(url, alreadyAdded, onAdded);

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
          <RemoteImage src={iconUrl} alt="" onError={() => setIconFailed(true)} />
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
        {alreadyAdded ? t('mobile.rail.added') : busy ? '…' : t('mobile.rail.add')}
      </button>
    </div>
  );
}

function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const urlId = useId();
  const { url, busy, error: err, setUrl, submit } = useAddRelayForm(onAdded);

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor={urlId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
        {t('shell.rail.addModal.urlLabel')}
      </label>
      <p style={{ fontSize: 12, color: 'var(--app-text-dim)', margin: 0, lineHeight: 1.5 }}>
        {t('mobile.rail.addHelp')}
      </p>
      <div className="setup-input-wrap">
        <Input
          autoFocus
          variant="mobile"
          id={urlId}
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
        {busy ? t('mobile.rail.adding') : t('mobile.rail.addRelay')}
      </button>
    </form>
  );
}
