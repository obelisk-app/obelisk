'use client';

import Button from '@/components/ui/buttons/Button';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { ZapIcon } from '@/assets/icons';
import { ReactorHoverCard } from './ReactorHoverCard';
import { ZapperHoverCard } from './ZapperHoverCard';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import { useReactionPills } from '@/hooks/shell/panes/message/useReactionPills';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** The zap total and one pill per reaction emoji under a message. */
export function ReactionPills({ actions, zapTotal, isAdmin }: {
  actions: MessageRowActions;
  zapTotal: MessageZapTotal | null;
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const vm = useReactionPills(actions, zapTotal, isAdmin);
  if (!vm.visible) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {vm.zap && (
        <div className="group/pill relative">
          <Button
            variant="bare"
            onClick={actions.onZapClick}
            disabled={actions.isOwn}
            className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200 hover:border-yellow-500 disabled:opacity-50"
          >
            <ZapIcon filled size={11} />
            {formatNumber(vm.zap.totalSats)}
          </Button>
          <ZapperHoverCard zapTotal={vm.zap} />
        </div>
      )}
      {vm.pills.map((pill) => (
        <div key={pill.emoji} className="group/pill relative">
          <Button
            variant="bare"
            onClick={() => vm.toggle(pill)}
            title={t(pill.titleKey)}
            className={
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-lc-white ' +
              (pill.active
                ? 'border-lc-green/60 bg-lc-green/10 hover:border-red-400'
                : 'border-lc-border bg-lc-card hover:border-lc-green')
            }
          >
            {pill.resolved.kind === 'custom' ? (
              <RemoteImage src={pill.resolved.url} alt={`:${pill.resolved.name}:`} className="h-4 w-4 object-contain" />
            ) : (
              <span>{pill.resolved.char}</span>
            )}
            <span>{pill.count}</span>
          </Button>
          {pill.pubkeys.size > 0 && (
            <ReactorHoverCard emoji={pill.emoji} pubkeys={pill.pubkeys} />
          )}
        </div>
      ))}
    </div>
  );
}
