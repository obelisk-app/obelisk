'use client';

import { useTranslations } from 'next-intl';
import type { DmRawEvent } from '@/services/nostr-bridge';
import { LockIcon } from '@/assets/icons';
import Button from '@/components/ui/buttons/Button';
import { copyWithToast } from '@/services/common/clipboard';
import { json } from '@/utils/chat/dm/dm-message-utils';

/** One raw event in the DM raw-event dialog: a hint, an optional warning, its id and kind, the JSON and a copy button. */
export function DmRawEventView({ event, hint, warning, testId }: { event: DmRawEvent; hint: string; warning?: string | null; testId: string }) {
  const t = useTranslations();
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
          onClick={() => copyWithToast(json(event), t('dm.msg.copied'))}
          data-testid={`${testId}-copy`}
        >
          {t('social.copyJson')}
        </Button>
      </div>
    </div>
  );
}
