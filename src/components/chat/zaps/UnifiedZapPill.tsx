'use client';

import { useTranslations } from 'next-intl';
import { HelpCircleIcon } from '@/assets/icons';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import UserName from '@/components/identity/UserName';
import { useUnifiedZap } from '@/hooks/chat/zaps/useUnifiedZap';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import type { MessageReactionInput } from '@/hooks/chat/message/useMessageActions';

export default function UnifiedZapPill({ message, groupId, reactions, total, isAdmin = false }: {
  message: { id: string; pubkey: string };
  groupId: string;
  reactions: ReadonlyArray<MessageReactionInput>;
  total: MessageZapTotal | null;
  isAdmin?: boolean;
}) {
  const t = useTranslations();
  const vm = useUnifiedZap(message, groupId, reactions, isAdmin, total);
  if (!total?.totalSats && !vm.ordinary) return null;
  return (
    <div className="relative inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200" data-testid="unified-zap">
      <Button variant="bare" onClick={vm.pay} disabled={vm.isOwn} title={t('chat.zap.sendNow', { amount: vm.amount })}>
        ⚡ {total ? t('shell.desktop.zaps.sats', { amount: vm.formatNumber(total.totalSats) }) : ''}
        {vm.ordinary && <span> · {t('chat.zap.unpaidReactions', { count: vm.ordinary.count })}</span>}
      </Button>
      <details className="relative">
        <summary aria-label={t('settings.wallet.presets.details')} className="cursor-pointer"><HelpCircleIcon size={14} /></summary>
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border border-lc-border bg-lc-dark p-3 shadow-lg">
          {total && <Text as="p" size="xs">{t('shell.desktop.zaps.count', { count: total.count })}</Text>}
          {total && vm.zappers.map(([pubkey, sats]) => (
            <div key={pubkey}><UserName pubkey={pubkey} /> · {t('shell.desktop.zaps.sats', { amount: vm.formatNumber(sats) })}</div>
          ))}
          {vm.extraZappers > 0 && <Text as="p" size="xs">{t('shell.desktop.reactions.andMore', { count: String(vm.extraZappers) })}</Text>}
          {vm.ordinary && <Text as="p" size="xs">{t('chat.zap.unpaidReactions', { count: vm.ordinary.count })}</Text>}
          {vm.ordinary && vm.reactors.map((pubkey) => <div key={pubkey}><UserName pubkey={pubkey} /></div>)}
          {vm.extraReactors > 0 && <Text as="p" size="xs">{t('shell.desktop.reactions.andMore', { count: String(vm.extraReactors) })}</Text>}
          {vm.ordinary && (isAdmin || vm.ordinary.mine) && (
            <Button variant="bare" onClick={() => void vm.remove()}>
              {t(isAdmin ? 'shell.desktop.reactions.removeEveryone' : 'shell.desktop.reactions.removeOwn')}
            </Button>
          )}
        </div>
      </details>
    </div>
  );
}
