'use client';

import { useTranslations } from 'next-intl';
import { repostersLine } from '@/utils/social/reposters';
import ReposterName from './ReposterName';

/**
 * "Alice, Bob and 6 others".
 *
 * Two names then a count: three is already too wide for a feed row, and the
 * number is what tells you how much reach the note actually got.
 */
export default function RepostersLine({
  pubkeys,
  onOpenProfile,
}: {
  pubkeys: readonly string[];
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const { shown, rest } = repostersLine(pubkeys);

  return (
    <>
      {shown.map((pubkey, index) => (
        <span key={pubkey}>
          {index > 0 && <span>, </span>}
          <ReposterName pubkey={pubkey} onOpenProfile={onOpenProfile} />
        </span>
      ))}
      {rest > 0 && (
        <span data-testid="repost-others">
          {' '}
          {t('social.andOthers', { n: String(rest) })}
        </span>
      )}
    </>
  );
}
