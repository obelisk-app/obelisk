'use client';

import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';

interface Props {
  /** Who may invite on the relay, and whether this account is one of them. */
  explanation: string;
  /** The meter ("7 of 10 left"); null when the relay sets no limit to show. */
  allowance: { left: number; total: number; percentLeft: number } | null;
  /** May invite, but the allowance is spent. */
  spent: boolean;
  relayName: string;
}

/** Who can invite on the chosen relay and, for this account, how much of its allowance is left. */
export default function RelayInviteAllowance({ explanation, allowance, spent, relayName }: Props) {
  const t = useTranslations();
  return (
    <div className="space-y-2" data-testid="relay-invite-allowance">
      <Text as="p" size="xs" tone="default" data-testid="relay-invite-explanation">{explanation}</Text>
      {allowance && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Text as="span" size="xs" tone="muted">{t('settings.invites.allowanceLabel')}</Text>
            <Text as="span" size="xs" weight="semibold" tone="default" data-testid="relay-invites-quota">
              {t('settings.invites.allowanceLeft', { left: allowance.left, total: allowance.total })}
            </Text>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-lc-border/50"
            role="meter"
            aria-label={t('settings.invites.allowanceLabel')}
            aria-valuenow={allowance.left}
            aria-valuemin={0}
            aria-valuemax={allowance.total}
          >
            <div className="h-full rounded-full bg-lc-green" style={{ width: `${allowance.percentLeft}%` }} />
          </div>
        </div>
      )}
      {spent && <Text as="p" size="xs" tone="muted" data-testid="relay-invites-spent">{t('settings.invites.spent', { relay: relayName })}</Text>}
    </div>
  );
}
