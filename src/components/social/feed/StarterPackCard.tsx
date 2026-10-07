'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Card from '@/components/ui/layout/Card';
import type { StarterPack } from '@/services/social/starter-packs';
import type { StarterPackRow } from '@/utils/social/starter-pack-rows';
import StarterPackFace from './StarterPackFace';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** One pack: title, description, how many are new, the follow button and the faces. */
export default function StarterPackCard({
  row,
  busy,
  onFollow,
  onOpenProfile,
}: {
  row: StarterPackRow;
  /** The id of the pack being followed, if any: every follow button waits for it. */
  busy: string | null;
  onFollow: (pack: StarterPack) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const { pack, already, remaining, faces, overflow } = row;
  return (
    <Card as="section" data-testid="starter-pack">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Heading as="h3" variant="panel" className="truncate">{pack.title}</Heading>
          {pack.description && (
            <Text as="p" size="13" tone="muted" className="mt-0.5 line-clamp-2">{pack.description}</Text>
          )}
          <Text as="p" size="11" tone="muted" className="mt-1">
            {t('social.packPeopleCount', { count: pack.members.length })}
            {already > 0 && ` · ${t('social.packAlreadyCount', { count: already })}`}
          </Text>
        </div>
        <Button
          variant="pill"
          size="xs"
          className="shrink-0"
          onClick={() => onFollow(pack)}
          disabled={busy !== null || remaining === 0}
          data-testid="starter-pack-follow"
        >
          {busy === pack.id
            ? t('common.saving')
            : remaining === 0
              ? t('social.packAllFollowed')
              : `${t('mobile.profile.follow')} ${remaining}`}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {faces.map((member) => (
          <StarterPackFace key={member} pubkey={member} onOpen={onOpenProfile} />
        ))}
        {overflow > 0 && (
          <span className="self-center text-[11px] text-lc-muted">
            +{overflow}
          </span>
        )}
      </div>
    </Card>
  );
}
