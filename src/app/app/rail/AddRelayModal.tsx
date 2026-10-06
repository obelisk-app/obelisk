'use client';

import { useId, useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';
import { faviconFor, SUGGESTED_RELAYS } from '@/services/relay-info';
import { shortHost } from '@/utils/relay-url/url-host';
import { useAddRelayForm, useSuggestedRelayAdd } from '@/hooks/chat/useAddRelayForm';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import { useTranslation } from '@/i18n/context';
import { colorFor, letterFor } from './relay-tile-style';
import { useRelayInfo } from '@/hooks/app/rail/useRelayInfo';
import CloseButton from '@/components/ui/CloseButton';
import RemoteImage from '@/components/ui/RemoteImage';

/** Add a relay to the rail: pick a suggested one, or type a URL. */
export function AddRelayModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'suggested' | 'custom'>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);

  return (
    <Modal
      onClose={onClose}
      panelClassName="lc-card flex max-h-[85vh] w-full max-w-lg mx-4 flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-2xl"
    >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-lg font-bold text-lc-white">{t('rail.addModal.title')}</h2>
            <p className="mt-1 text-sm text-lc-muted">{t('rail.addModal.subtitle')}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="mt-4 flex border-b border-lc-border px-6">
          <TabButton active={tab === 'suggested'} onClick={() => setTab('suggested')}>
            {t('rail.addModal.suggested')}
          </TabButton>
          <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
            {t('rail.addModal.custom')}
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'suggested' ? (
            <ul className="flex flex-col gap-2">
              {SUGGESTED_RELAYS.map((r) => (
                <SuggestedRelayItem
                  key={r.url}
                  url={r.url}
                  alreadyAdded={configuredSet.has(r.url)}
                  onAdded={onClose}
                />
              ))}
            </ul>
          ) : (
            <CustomRelayForm onAdded={onClose} />
          )}
        </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'relative -mb-px flex-1 px-4 py-3 text-sm font-semibold transition-colors ' +
        (active ? 'text-lc-white' : 'text-lc-muted hover:text-lc-white')
      }
    >
      {children}
      <span
        className={
          'absolute bottom-0 left-0 right-0 h-0.5 rounded-full transition-opacity ' +
          (active ? 'bg-lc-green opacity-100' : 'opacity-0')
        }
      />
    </button>
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
  const { t } = useTranslation();
  const { info } = useRelayInfo(url);
  const [iconFailed, setIconFailed] = useState(false);
  const { busy, error: err, add } = useSuggestedRelayAdd(url, alreadyAdded, onAdded);

  const name = info?.name || shortHost(url);
  const description = info?.description || '<an undescribed relay>';
  const icon = info?.icon || faviconFor(url);
  const initials = letterFor(shortHost(url));
  const accent = colorFor(shortHost(url));

  return (
    <li className="flex items-center gap-3 rounded-xl border border-lc-border bg-lc-card/60 p-3">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
        style={{ background: icon && !iconFailed ? '#000' : accent }}
      >
        {icon && !iconFailed ? (
          <RemoteImage
            src={icon}
            alt=""
            onError={() => setIconFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-lc-white">{name}</div>
        <div className="truncate font-mono text-xs text-lc-muted">{url}</div>
        <div className="mt-0.5 truncate text-xs text-lc-muted">{description}</div>
        {err && <ErrorState as="div" className="mt-1">{err}</ErrorState>}
      </div>
      <Button onClick={() => void add()} disabled={alreadyAdded || busy} className="shrink-0">
        {alreadyAdded
          ? t('rail.addModal.added')
          : busy ? t('rail.addModal.adding') : t('rail.addModal.add')}
      </Button>
    </li>
  );
}

function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const { url, busy, error: err, setUrl, submit } = useAddRelayForm(onAdded);

  const urlId = useId();
  return (
    <form onSubmit={(e) => void submit(e)}>
      <label htmlFor={urlId} className="block text-sm font-semibold text-lc-white">{t('rail.addModal.urlLabel')}</label>
      <p className="mt-1 text-xs text-lc-muted">{t('rail.addModal.urlHint')}</p>
      <Input
        id={urlId}
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        spellCheck={false}
        className="mt-3 font-mono"
      />
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={busy || !url.trim()}>
          {busy ? t('rail.addModal.adding') : t('rail.addRelay')}
        </Button>
      </div>
    </form>
  );
}
