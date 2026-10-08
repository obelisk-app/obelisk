'use client';

import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import { useSuggestedRelayItem } from '@/hooks/relay/rail/useSuggestedRelayItem';
import Button from '@/components/ui/buttons/Button';
import ErrorState from '@/components/ui/feedback/ErrorState';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One suggested relay in the add-relay dialog: icon, name, URL, description and Add. */
export function SuggestedRelayItem({
  url,
  alreadyAdded,
  onAdded,
}: {
  url: string;
  alreadyAdded: boolean;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const item = useSuggestedRelayItem(url, alreadyAdded, onAdded);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-lc-border bg-lc-card/60 p-3">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
        style={{ background: item.icon ? '#000' : item.accent }}
      >
        {item.icon ? (
          <RemoteImage
            src={item.icon}
            alt=""
            onError={item.onIconError}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{item.initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Text as="div" size="sm" tone="default" weight="semibold" className="truncate">{item.name}</Text>
        <Text as="div" variant="caption" className="truncate font-mono">{url}</Text>
        <Text as="div" variant="caption" className="mt-0.5 truncate">{item.description || t('shell.rail.addModal.noDescription')}</Text>
        {item.error && <ErrorState as="div" className="mt-1">{item.error}</ErrorState>}
      </div>
      <Button onClick={() => void item.add()} disabled={alreadyAdded || item.busy} className="shrink-0">
        {alreadyAdded ? t('shell.rail.addModal.added') : item.busy ? t('shell.rail.addModal.adding') : t('shell.rail.addModal.add')}
      </Button>
    </li>
  );
}
