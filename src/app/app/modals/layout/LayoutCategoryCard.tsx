'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import Input from '@/components/ui/Input';
import { ChannelOrderRow, DragHandleIcon, MoveButtons } from './ChannelOrderRow';
import type { useLayoutDrag } from './useLayoutDrag';
import Button from '@/components/ui/Button';

type Category = { id: string; name: string; channelIds: ReadonlyArray<string> };

type Props = {
  cat: Category;
  idx: number;
  categories: ReadonlyArray<Category>;
  channelsById: Readonly<Record<string, JsGroup>>;
  drag: ReturnType<typeof useLayoutDrag>;
  renameCategory: (id: string, name: string) => void;
  moveCategory: (id: string, delta: number) => void;
  deleteCategory: (id: string) => void;
  moveChannel: (id: string, delta: number) => void;
  setChannelCategory: (id: string, categoryId: string | null) => void;
};

/** One category in the layout editor: name, reorder, delete, and its channels. */
export function LayoutCategoryCard({
  cat, idx, categories, channelsById, drag, renameCategory, moveCategory, deleteCategory, moveChannel, setChannelCategory,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl border border-lc-border bg-lc-black/40 p-3 transition-colors hover:border-lc-green/30"
      onDragOver={(event) => { if (drag.dragged) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        drag.dropOnCategory(idx, cat.id);
      }}
      data-testid={`layout-category-${cat.id}`}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          draggable
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; drag.grabCategory(cat.id); }}
          onDragEnd={drag.endDrag}
          className="cursor-grab active:cursor-grabbing"
          aria-label={`Grab category ${cat.name}`}
          title={t('desktop.layout.dragCategory')}
        >
          <DragHandleIcon />
        </Button>
        <Input
          size="xs"
          fontSize="sm"
          value={cat.name}
          onChange={(e) => renameCategory(cat.id, e.target.value)}
          aria-label={t('desktop.layout.categoryName')}
          className="flex-1 font-semibold"
        />
        <MoveButtons
          onMove={(delta) => moveCategory(cat.id, delta)}
          first={idx === 0}
          last={idx === categories.length - 1}
        />
        <Button
          variant="ghost"
          size="xs"
          tone="danger"
          onClick={() => deleteCategory(cat.id)}
          className="text-red-400"
          title={t('mobile.layout.deleteCategory')}
        >
          {t('mobile.layout.delete')}
        </Button>
      </div>
      <div className="mt-2 space-y-1">
        {cat.channelIds.length === 0 ? (
          <div className="rounded border border-dashed border-lc-border px-2 py-2 text-center text-[11px] text-lc-muted">
            {t('desktop.layout.dropHere')}
          </div>
        ) : (
          cat.channelIds.map((id, i) => (
            <ChannelOrderRow
              key={id}
              channel={channelsById[id]}
              bucket={cat.id}
              first={i === 0}
              last={i === cat.channelIds.length - 1}
              categories={categories}
              onMove={(d) => moveChannel(id, d)}
              onChangeCategory={(catId) => setChannelCategory(id, catId)}
              onGrab={() => drag.grabChannel(id)}
              onDragEnd={drag.endDrag}
              onDropBefore={() => drag.dropBefore(cat.id, id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
