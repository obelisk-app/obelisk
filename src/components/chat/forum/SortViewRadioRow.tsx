'use client';

import { MenuItem } from '@/components/ui/overlays/menu';

/** One radio choice in the "Sort & view" popover. */
export function SortViewRadioRow({
  label,
  checked,
  onClick,
  testId,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  testId?: string;
}) {
  // A plain object, so the `data-checked` marker the tests and styles read
  // can ride along with the ARIA state.
  const state = { 'aria-checked': checked, 'data-checked': checked ? 'true' : 'false' };
  return (
    <MenuItem
      role="menuitemradio"
      label={label}
      onClick={onClick}
      testId={testId}
      buttonProps={state}
      trailing={
        <span
          className={
            'h-3.5 w-3.5 rounded-full border-2 shrink-0 ' +
            (checked ? 'border-lc-green bg-lc-green' : 'border-lc-border')
          }
        />
      }
    />
  );
}
