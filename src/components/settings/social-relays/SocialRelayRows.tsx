import Button from '@/components/ui/buttons/Button';
import { CloseIcon } from '@/components/ui/icons/icons';
import Input from '@/components/ui/forms/Input';
import { probeRelay, type RelayStatus } from '@/services/social/relay-status';
import { relayKey } from '@/utils/settings/social-relays';
import { RelayDot } from './RelayIndicators';
import RelayStats from './RelayStats';
import type { Translate } from '@/i18n/keys';

/** One editable row per draft relay: status dot, URL field, stats, remove. */
export default function SocialRelayRows({
  draft,
  statuses,
  invalid,
  onUpdate,
  onRemove,
  t,
}: {
  draft: ReadonlyArray<string>;
  statuses: Readonly<Record<string, RelayStatus>>;
  invalid: ReadonlySet<number>;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-2">
      {draft.map((relay, index) => (
        <div key={index} className="flex items-center gap-2">
          <RelayDot
            status={statuses[relayKey(relay)]}
            onRetry={() => void probeRelay(relay)}
          />
          <Input
            value={relay}
            onChange={(event) => onUpdate(index, event.target.value)}
            aria-label={`${t('settings.preferences.socialRelays.relay')} ${index + 1}`}
            invalid={invalid.has(index)}
            fontSize="xs"
            className="min-w-0 flex-1 font-mono"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="wss://relay.example"
          />
          <RelayStats status={statuses[relayKey(relay)]} />
          <Button
            variant="ghost"
            tone="danger"
            size="icon-md"
            className="shrink-0"
            onClick={() => onRemove(index)}
            aria-label={`${t('settings.preferences.socialRelays.remove')} ${relay || index + 1}`}
            disabled={draft.length <= 1}
          >
            <CloseIcon size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}
