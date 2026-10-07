'use client';

import { useTranslations } from 'next-intl';

/** The three media kinds as `<option>`s, for the pack editor's kind selects. */
export default function PackKindOptions() {
  const t = useTranslations();
  return (
    <>
      <option value="emoji">{t('media.kind.emoji')}</option><option value="gif">{t('media.kind.gif')}</option><option value="sticker">{t('media.kind.sticker')}</option>
    </>
  );
}
