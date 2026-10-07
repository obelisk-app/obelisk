'use client';

import { useTranslations } from 'next-intl';
import { CALL_RELAY_MAX } from '@/services/preferences/preferences';
import { CloseIcon } from '@/assets/icons';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import { isBadRelayDraft } from '@/utils/settings/call-relays';
import { useCallRelayEditor, type CallRelayStatus } from '@/hooks/settings/notifications/useCallRelayEditor';

/** The call relay rows, with add, reset and save. */
export default function CallRelayEditor({
  saved, onStatus,
}: {
  saved: readonly string[]; onStatus: (s: CallRelayStatus) => void;
}) {
  const t = useTranslations();
  const vm = useCallRelayEditor(saved, onStatus);
  return (
    <>
      {vm.draft.map((relay, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={relay}
            onChange={(e) => vm.change(i, e.target.value)}
            aria-label={`${t('settings.calls.relay')} ${i + 1}`}
            invalid={isBadRelayDraft(relay)}
            fontSize="xs"
            className="min-w-0 flex-1 font-mono"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="wss://relay.example"
            data-testid="call-relay-input"
          />
          <Button
            variant="ghost"
            tone="danger"
            size="icon-md"
            className="shrink-0"
            onClick={() => vm.remove(i)}
            disabled={vm.draft.length <= 1}
            aria-label={`${t('settings.calls.removeRelay')} ${relay || i + 1}`}
          >
            <CloseIcon size={14} />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="pillSecondary" size="xs" onClick={vm.add} disabled={vm.draft.length >= CALL_RELAY_MAX}>
          {t('settings.calls.addRelay')}
        </Button>
        <Button variant="pillSecondary" size="xs" onClick={vm.reset}>
          {t('settings.calls.reset')}
        </Button>
        <Button variant="pill" size="xs" onClick={vm.save} data-testid="call-relay-save">
          {t('common.save')}
        </Button>
      </div>
    </>
  );
}
