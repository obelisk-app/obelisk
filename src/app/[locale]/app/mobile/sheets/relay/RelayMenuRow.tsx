'use client';

import Button from '@/components/ui/buttons/Button';

const rowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 12px',
  background: 'var(--app-surface)',
  border: '1px solid var(--app-line)',
  borderRadius: 12,
  color: 'var(--app-text)',
  textAlign: 'left',
  cursor: 'pointer',
};

/**
 * One menu row. Defined at module scope on purpose: declared inside the
 * sheet, it was a new component type on every render, so React unmounted
 * and remounted every row (fresh DOM nodes, focus lost) each time the sheet
 * re-rendered, which it does on every busy-hint and toast change.
 */
export function RelayMenuRow({
  icon,
  rowLabel,
  hint,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  rowLabel: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      variant="bare"
      onClick={onClick}
      style={{ ...rowStyle, color: danger ? 'var(--presence-dnd, #ef4444)' : rowStyle.color }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{rowLabel}</span>
      </span>
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--app-text-mute)' }}>{hint}</span>
      )}
    </Button>
  );
}
