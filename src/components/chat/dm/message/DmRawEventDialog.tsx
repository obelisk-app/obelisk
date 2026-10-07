'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { rawEventFacts } from '@/utils/chat/dm/dm-message-utils';
import { DmRawEventView } from './DmRawEventView';
import Text from '@/components/ui/layout/Text';

export function DmRawEventDialog({ message, onClose }: { message: JsDirectMessage; onClose: () => void }) {
  const t = useTranslations();
  const { rumor, wire, holdsKey, nip04 } = rawEventFacts(message);
  const [tab, setTab] = useState<'message' | 'wire'>(rumor ? 'message' : 'wire');

  return (
    <Modal
      onClose={onClose}
      testId="dm-raw-modal"
      panelClassName="w-full max-w-2xl mx-4 flex flex-col overflow-hidden rounded-xl bg-lc-dark border border-lc-border shadow-xl"
    >
      <ModalHeader title={t('dm.raw.title')} onClose={onClose}>
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
      </ModalHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!rumor && !wire && <Text as="p" variant="caption">{t('dm.raw.unavailable')}</Text>}
        {rumor && tab === 'message' && (
          <DmRawEventView
            event={rumor}
            hint={t('dm.raw.rumorHint', { kind: String(rumor.kind) })}
            warning={holdsKey ? t('dm.raw.keyWarning') : null}
            testId="dm-raw-rumor"
          />
        )}
        {wire && (tab === 'wire' || !rumor) && (
          <>
            <DmRawEventView event={wire} hint={nip04 ? t('dm.raw.nip04Hint') : t('dm.raw.wrapHint')} testId="dm-raw-wire" />
            {nip04 && (
              <div className="mt-3">
                <Text as="p" size="11" tone="muted" className="mb-1">{t('dm.raw.decrypted')}</Text>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-lc-border bg-lc-black p-3 text-xs text-lc-white">
                  {message.content}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
