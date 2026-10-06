'use client';

import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import MediaThumb from '@/components/media/MediaThumb';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import Text from '@/components/ui/Text';
import { useTranslations } from 'next-intl';

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
  const serverLabel = serverSelected ? "Remove pack from server" : "Add pack to server";
  return (
    <Card as="article" surface="translucent" padding="none" className="overflow-hidden">
      <div className="flex min-h-24 items-center gap-2 bg-lc-black p-3">
        {pack.items.slice(0, 5).map((item) => (
          <button key={item.url} type="button" onClick={() => onOpenItem(item)} title={t('media.openActions')} aria-label={"Open :" + item.name + ": actions"} className="group relative flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg bg-lc-dark p-1">
            <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
            {!server && itemFavorites.some((saved) => saved.url === item.url) && <span className="absolute right-1 top-1 text-xs text-lc-green">★</span>}
          </button>
        ))}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-lc-white">{pack.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-lc-muted">{pack.description || pack.items.length + " items"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" onClick={onView}>{t('media.viewPack')}</Button>
          {!server && <Chip state={favorite ? 'selected' : 'idle'} disabled={busy} onClick={onFavorite} aria-label={favorite ? "Remove " + pack.title + " from saved packs" : "Save " + pack.title}>{favorite ? "★ Saved" : "☆ Save pack"}</Chip>}
          {mine && !server && <Button variant="secondary" size="xs" onClick={onEdit}>{t('media.edit')}</Button>}
          {mine && !server && <Button variant="outline" tone="danger" size="xs" disabled={busy} onClick={onDelete}>{t('media.delete')}</Button>}
          {server && (serverSelected
            ? <Button variant="outline" tone="danger" size="xs" disabled={busy} onClick={onServer}>{serverLabel}</Button>
            : <Button size="xs" disabled={busy} onClick={onServer}>{serverLabel}</Button>)}
          <Text size="10" variant="label" tone="muted" className="ml-auto self-center">{pack.items.length} items</Text>
        </div>
      </div>
    </Card>
  );
}
