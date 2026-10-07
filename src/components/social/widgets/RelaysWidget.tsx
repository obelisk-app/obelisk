'use client';

import { useTranslations } from 'next-intl';
import { useRelaysWidget } from '@/hooks/social/widgets/useRelaysWidget';
import { relayLatencyLabel } from '@/utils/social/relay-status-rows';
import { RELAY_STATE_DOT } from '@/constants/social/relay-status-rows';
import { shortHost } from '@/utils/relay-url/url-host';
import TextButton from '@/components/ui/buttons/TextButton';
import WidgetCard from './WidgetCard';

/**
 * Where the feed's notes are coming from, and whether it is working.
 *
 * The header pill answers this in a popover, which is the right shape for a
 * glance. This is for the reader who is actively tuning their relay set and
 * wants it on screen while they scroll: the commonest cause of a thin feed
 * is a relay set nobody chose, and that is invisible until you look.
 *
 * It does not start the watcher; the pill owns that and is always mounted.
 */
export default function RelaysWidget() {
  const t = useTranslations();
  const vm = useRelaysWidget();

  return (
    <WidgetCard
      title={t('social.relays')}
      testId="widget-relays"
      action={(
        <TextButton
          onClick={vm.manage} className="shrink-0 text-[11px] font-medium"
          data-testid="widget-relays-manage"
        >
          {t('social.relaySettings')}
        </TextButton>
      )}
    >
      <ul>
        {vm.rows.map(({ relay, status, state }) => (
          <li
            key={relay}
            className="flex items-center gap-2 px-2 py-1.5"
            data-testid="widget-relay-row"
            data-state={state}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${RELAY_STATE_DOT[state]}`} role="img" aria-label={state} />
            <span className="min-w-0 flex-1 truncate text-xs text-lc-white">{shortHost(relay)}</span>
            {state === 'failed' ? (
              <TextButton
                onClick={() => vm.retry(relay)} className="shrink-0 px-1.5 py-0.5 text-[10px]"
              >
                {t('common.retry')}
              </TextButton>
            ) : (
              <span className="shrink-0 font-mono text-[10px] text-lc-muted">
                {relayLatencyLabel(status)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
