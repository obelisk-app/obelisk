'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/context';
import type { DmRawEvent, JsDirectMessage } from '@/services/nostr-bridge';
import Modal from '@/components/ui/Modal';
import { LockIcon } from '@/components/ui/icons';
import Button from '@/components/ui/Button';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { copy, json, rawEventFacts } from './dm-message-utils';

function RawEventView({ event, hint, warning, testId }: { event: DmRawEvent; hint: string; warning?: string | null; testId: string }) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId}>
      <p className="mb-2 text-xs text-lc-muted">{hint}</p>
      {warning && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300" role="note">
          <LockIcon size={13} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
      <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-lc-muted">{t('social.eventIdLabel')}</dt>
        <dd className="truncate font-mono text-lc-white">{event.id}</dd>
        <dt className="text-lc-muted">{t('social.kindLabel')}</dt>
        <dd className="font-mono text-lc-white">{event.kind}</dd>
      </dl>
      {/* `break-all`: an event is full of 64-char hex strings. */}
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-lc-border bg-lc-black p-3 font-mono text-[11px] leading-relaxed text-lc-white/80">
        {json(event)}
      </pre>
      <div className="mt-2 flex justify-end">
        <Button
          variant="pillSecondary"
          size="xs"
          onClick={() => copy(json(event), t('dm.msg.copied'))}
          data-testid={`${testId}-copy`}
        >
          {t('social.copyJson')}
        </Button>
      </div>
    </div>
  );
}

export function DmRawEventDialog({ message, onClose }: { message: JsDirectMessage; onClose: () => void }) {
  const { t } = useTranslation();
  const { rumor, wire, holdsKey, nip04 } = rawEventFacts(message);
  const [tab, setTab] = useState<'message' | 'wire'>(rumor ? 'message' : 'wire');

  return (
    <Modal
      onClose={onClose}
      testId="dm-raw-modal"
      panelClassName="w-full max-w-2xl mx-4 rounded-xl bg-lc-dark border border-lc-border p-5 shadow-xl"
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-lc-white">{t('dm.raw.title')}</h2>
        {rumor && wire && (
          <SegmentedControl
            aria-label={t('dm.raw.title')}
            className="ml-auto"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'message', label: t('dm.raw.tabMessage'), testId: 'dm-raw-tab-message' },
              { value: 'wire', label: t('dm.raw.tabWire'), testId: 'dm-raw-tab-wire' },
            ]}
          />
        )}
      </div>
      {!rumor && !wire && <p className="text-xs text-lc-muted">{t('dm.raw.unavailable')}</p>}
      {rumor && tab === 'message' && (
        <RawEventView
          event={rumor}
          hint={t('dm.raw.rumorHint').replace('{kind}', String(rumor.kind))}
          warning={holdsKey ? t('dm.raw.keyWarning') : null}
          testId="dm-raw-rumor"
        />
      )}
      {wire && (tab === 'wire' || !rumor) && (
        <>
          <RawEventView event={wire} hint={nip04 ? t('dm.raw.nip04Hint') : t('dm.raw.wrapHint')} testId="dm-raw-wire" />
          {nip04 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-lc-muted">{t('dm.raw.decrypted')}</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-lc-border bg-lc-black p-3 text-xs text-lc-white">
                {message.content}
              </pre>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
