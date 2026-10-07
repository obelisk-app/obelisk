'use client';

import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import MediaThumb from '@/components/media/library/MediaThumb';
import Button from '@/components/ui/buttons/Button';
import Card from '@/components/ui/layout/Card';
import Chip from '@/components/ui/data/Chip';
import Text from '@/components/ui/layout/Text';
import { useTranslations } from 'next-intl';
import { isFavoriteItem } from '@/utils/media/library/library-view';
import Heading from '@/components/ui/layout/Heading';

/** One pack in the library grid: a strip of its first items and its actions. */
export default function PackCard({ pack, mine, favorite, itemFavorites, busy, server, serverSelected, onView, onOpenItem, onEdit, onDelete, onFavorite, onServer }: {
  pack: JsMediaPack;
  mine: boolean;
  favorite: boolean;
  itemFavorites: readonly JsMediaItem[];
  busy: boolean;
  server: boolean;
  serverSelected: boolean;
  onView: () => void;
  onOpenItem: (item: JsMediaItem) => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onServer: () => void;
}) {
  const t = useTranslations();
  const serverLabel = t(serverSelected ? 'media.pack.removeFromServer' : 'media.pack.addToServer');
  return (
    <Card as="article" surface="translucent" padding="none" className="overflow-hidden">
      <div className="flex min-h-24 items-center gap-2 bg-lc-black p-3">
        {pack.items.slice(0, 5).map((item) => (
          <button key={item.url} type="button" onClick={() => onOpenItem(item)} title={t('media.openActions')} aria-label={t('media.item.open', { name: item.name })} className="group relative flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg bg-lc-dark p-1">
            <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
            {!server && isFavoriteItem(itemFavorites, item) && <span className="absolute right-1 top-1 text-xs text-lc-green">★</span>}
          </button>
        ))}
      </div>
      <div className="p-3">
        <Heading as="h3" variant="panel" className="truncate">{pack.title}</Heading>
        <Text as="p" variant="caption" className="mt-1 line-clamp-2">{pack.description || t('media.itemCount', { count: pack.items.length })}</Text>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" onClick={onView}>{t('media.viewPack')}</Button>
          {!server && <Chip state={favorite ? 'selected' : 'idle'} disabled={busy} onClick={onFavorite} aria-label={favorite ? t('media.pack.unsaveNamed', { title: pack.title }) : t('media.pack.saveNamed', { title: pack.title })}>{favorite ? '★' : '☆'} {t(favorite ? 'media.pack.saved' : 'media.pack.save')}</Chip>}
          {mine && !server && <Button variant="secondary" size="xs" onClick={onEdit}>{t('media.edit')}</Button>}
          {mine && !server && <Button variant="outline" tone="danger" size="xs" disabled={busy} onClick={onDelete}>{t('media.delete')}</Button>}
          {server && (serverSelected
            ? <Button variant="outline" tone="danger" size="xs" disabled={busy} onClick={onServer}>{serverLabel}</Button>
            : <Button size="xs" disabled={busy} onClick={onServer}>{serverLabel}</Button>)}
          <Text size="10" variant="label" tone="muted" className="ml-auto self-center">{t('media.itemCount', { count: pack.items.length })}</Text>
        </div>
      </div>
    </Card>
  );
}
