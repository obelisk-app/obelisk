'use client';

import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import Input from '@/components/ui/forms/Input';
import { ChevronDownIcon, ChevronUpIcon } from '@/assets/icons';
import Label from '@/components/ui/forms/Label';

const arrowBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid var(--app-line)',
  background: 'var(--app-surface)',
  color: 'var(--app-text-dim)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** The draft's categories: reorder with up/down, rename in place, delete. */
export function CategoryListEditor({ categories, moveCategory, renameCategory, deleteCategory }: {
  categories: ReadonlyArray<{ id: string; name: string }>;
  moveCategory: (id: string, delta: number) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label variant="sheet">
        {t('mobile.layout.categories')}
      </Label>
      {categories.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--app-text-mute)', padding: '6px 4px' }}>
          {t('mobile.layout.empty')}
        </div>
      ) : (
        categories.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--app-surface)',
              border: '1px solid var(--app-line)',
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button type="button" style={arrowBtnStyle} onClick={() => moveCategory(c.id, -1)} disabled={i === 0} aria-label={t('mobile.layout.moveUp')}>
                <ChevronUpIcon size={14} strokeWidth={2.5} />
              </button>
              <button type="button" style={arrowBtnStyle} onClick={() => moveCategory(c.id, 1)} disabled={i === categories.length - 1} aria-label={t('mobile.layout.moveDown')}>
                <ChevronDownIcon size={14} strokeWidth={2.5} />
              </button>
            </div>
            <Input
              variant="mobile"
              style={{ flex: 1 }}
              value={c.name}
              placeholder={categoryLabel('', t)}
              aria-label={t('shell.desktop.layout.categoryName')}
              onChange={(e) => renameCategory(c.id, e.target.value)}
            />
            <button
              type="button"
              onClick={() => deleteCategory(c.id)}
              style={{
                border: '1px solid var(--app-line)',
                borderRadius: 8,
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--presence-dnd, #ef4444)',
                fontSize: 11,
              }}
              aria-label={t('mobile.layout.deleteCategory')}
            >
              {t('mobile.layout.delete')}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
