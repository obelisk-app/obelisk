'use client';

import Button from '@/components/ui/buttons/Button';

/** One row of the phone channel sheet: a label, an optional hint, a chevron for a drill-in or a radio toggle. */
export function ChannelSheetRow({ label, onClick, hint, testId, disabled, chevron, checked }: {
  label: string;
  onClick: () => void;
  hint?: string | null;
  testId: string;
  disabled?: boolean;
  chevron?: boolean;
  checked?: boolean;
}) {
  return (
    <Button
      variant="mobileRow"
      type="button"
      style={{ width: '100%', opacity: disabled ? 0.45 : 1 }}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      role={checked === undefined ? undefined : 'menuitemradio'}
      aria-checked={checked}
    >
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span style={{ display: 'block' }}>{label}</span>
        {hint && <span className="settings-row-meta muted" style={{ display: 'block', marginTop: 3 }}>{hint}</span>}
      </span>
      {chevron && <span className="settings-row-meta muted" aria-hidden="true">›</span>}
      {checked !== undefined && <span className={`toggle ${checked ? 'on' : ''}`} aria-hidden="true" />}
    </Button>
  );
}
