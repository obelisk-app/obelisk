import { useId, type ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/** The ids a control uses to point back at the row's text. */
export interface SettingRowIds {
  labelId: string;
  descriptionId: string | undefined;
}

export interface SettingRowProps {
  label: ReactNode;
  /** Muted line under the label. */
  description?: ReactNode;
  /**
   * The control on the right. Pass a function to receive the ids, and wire
   * them as `aria-labelledby` / `aria-describedby` on a control that has no
   * visible label of its own (a Toggle).
   */
  control: ReactNode | ((ids: SettingRowIds) => ReactNode);
  /** For a native field: renders the label as `<label for>`. */
  htmlFor?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Label on top, muted description under it, control on the right: the
 * desktop settings row (`flex items-start justify-between gap-4`). The mobile
 * shell keeps its own `.settings-row` stylesheet class.
 */
export default function SettingRow({ label, description, control, htmlFor, className, 'data-testid': testId }: SettingRowProps) {
  const base = useId();
  const ids: SettingRowIds = {
    labelId: `${base}-label`,
    descriptionId: description !== undefined ? `${base}-description` : undefined,
  };
  return (
    <div className={cn('flex items-start justify-between gap-4', className)} data-testid={testId}>
      <div className="min-w-0">
        {htmlFor ? (
          <label id={ids.labelId} htmlFor={htmlFor} className="block text-sm text-lc-white">{label}</label>
        ) : (
          <div id={ids.labelId} className="text-sm text-lc-white">{label}</div>
        )}
        {description !== undefined && (
          <div id={ids.descriptionId} className="mt-0.5 text-xs text-lc-muted">{description}</div>
        )}
      </div>
      {typeof control === 'function' ? control(ids) : control}
    </div>
  );
}
