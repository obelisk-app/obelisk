'use client';

import { useTranslations } from 'next-intl';
import Select from '@/components/ui/forms/Select';

interface Props {
  /** The person's relays: the one in view first, then the rest of their list. */
  choices: ReadonlyArray<{ url: string; label: string }>;
  value: string;
  onPick: (url: string) => void;
  mobile?: boolean;
}

/**
 * Which relay the invite links are for. Picking one only changes this panel;
 * the relay in view stays as it was.
 */
export default function RelayInviteRelayPicker({ choices, value, onPick, mobile = false }: Props) {
  const t = useTranslations();
  return (
    <Select
      label={t('settings.invites.relayLabel')}
      hint={t('settings.invites.relayHint')}
      value={value}
      onChange={(e) => onPick(e.target.value)}
      size={mobile ? 'md' : 'sm'}
      className="w-full"
      data-testid="relay-invite-relay-picker"
    >
      {choices.map((c) => <option key={c.url} value={c.url}>{c.label}</option>)}
    </Select>
  );
}
