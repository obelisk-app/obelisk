'use client';

import { useTranslation } from '@/i18n/context';
import Input from '@/components/ui/Input';

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
  const { t } = useTranslation();
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {t('mobile.layout.categories')}
      </label>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
              </button>
              <button type="button" style={arrowBtnStyle} onClick={() => moveCategory(c.id, 1)} disabled={i === categories.length - 1} aria-label={t('mobile.layout.moveDown')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </div>
            <Input
              variant="mobile"
              style={{ flex: 1 }}
              value={c.name}
              aria-label={t('desktop.layout.categoryName')}
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
