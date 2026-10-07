'use client';

import { resolveReactionEmoji } from '@/utils/message-text/emoji-shortcodes';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { ZapIcon } from '@/components/ui/icons/icons';
import { ReactorHoverCard, ZapperHoverCard } from './MessageHoverCards';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** The zap total and one pill per reaction emoji under a message. */
export function ReactionPills({ actions, zapTotal, isAdmin }: {
  actions: MessageRowActions;
  zapTotal: MessageZapTotal | null;
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const { counts, myReactedEmojis, onReactionClick, onZapClick, isOwn } = actions;
  if (!(counts.length > 0 || (zapTotal && zapTotal.totalSats > 0))) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {zapTotal && zapTotal.totalSats > 0 && (
        <div className="group/pill relative">
          <button
            onClick={onZapClick}
            disabled={isOwn}
            className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200 hover:border-yellow-500 disabled:opacity-50"
          >
            <ZapIcon filled size={11} />
            {formatNumber(zapTotal.totalSats)}
          </button>
          <ZapperHoverCard zapTotal={zapTotal} />
        </div>
      )}
      {counts.map(({ emoji, customEmojis, pubkeys, reactionIds, count, myReactionId }) => {
        const mine = myReactedEmojis.has(emoji);
        const resolved = resolveReactionEmoji(emoji, customEmojis);
        const removeForEveryone = isAdmin;
        return (
          <div key={emoji} className="group/pill relative">
            <button
              onClick={() => onReactionClick(emoji, customEmojis, myReactionId, removeForEveryone ? reactionIds : undefined)}
              title={removeForEveryone ? t('shell.desktop.reactions.removeEveryone') : mine ? t('shell.desktop.reactions.removeOwn') : t('shell.desktop.reactions.react')}
              className={
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-lc-white ' +
                (removeForEveryone || mine
                  ? 'border-lc-green/60 bg-lc-green/10 hover:border-red-400'
                  : 'border-lc-border bg-lc-card hover:border-lc-green')
              }
            >
              {resolved.kind === 'custom' ? (
                <RemoteImage src={resolved.url} alt={`:${resolved.name}:`} className="h-4 w-4 object-contain" />
              ) : (
                <span>{resolved.char}</span>
              )}
              <span>{count}</span>
            </button>
            {pubkeys.size > 0 && (
              <ReactorHoverCard emoji={emoji} pubkeys={pubkeys} />
            )}
          </div>
        );
      })}
    </div>
  );
}
