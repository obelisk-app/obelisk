'use client';

/** One radio-style row in the forum sort sheet: a label and a filled dot when checked. */
export function SortSheetRow({
  label,
  checked,
  onClick,
  testId,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-checked={checked ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        background: 'transparent',
        border: 'none',
        color: 'var(--app-text)',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `2px solid ${checked ? 'var(--accent)' : 'var(--app-line)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          flexShrink: 0,
        }}
      />
    </button>
  );
}
