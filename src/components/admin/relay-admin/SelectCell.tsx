'use client';

import { useTranslations } from 'next-intl';
import Checkbox from '@/components/ui/forms/Checkbox';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { profileNameOr } from '@/utils/identity/profile-labels';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/** The row checkbox, named after the person it selects. */
export default function SelectCell({ pubkey, selected, onToggle }: { pubkey: string; selected: boolean; onToggle: () => void }) {
  const t = useTranslations();
  const meta = useAuthor(pubkey);
  return (
    <Checkbox
      checked={selected}
      onChange={onToggle}
      aria-label={t('admin.selectRow', { user: profileNameOr(meta, shortNpubLabel(pubkey)) })}
      className="cursor-pointer"
    />
  );
}
