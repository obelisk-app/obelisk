'use client';

import { useSuggestedRelayItem } from '@/hooks/shell/rail/useSuggestedRelayItem';
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
        <div className="truncate text-sm font-semibold text-lc-white">{item.name}</div>
        <div className="truncate font-mono text-xs text-lc-muted">{url}</div>
        <div className="mt-0.5 truncate text-xs text-lc-muted">{item.description}</div>
        {item.error && <ErrorState as="div" className="mt-1">{item.error}</ErrorState>}
      </div>
      <Button onClick={item.add} disabled={alreadyAdded || item.busy} className="shrink-0">
        {item.buttonLabel}
      </Button>
    </li>
  );
}
