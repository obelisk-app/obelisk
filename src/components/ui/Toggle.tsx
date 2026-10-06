import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import Spinner from './Spinner';

/** `loading`: the change is being saved. The switch is busy and ignores clicks, with a spinner in the knob. */
export type ToggleStatus = 'idle' | 'loading';

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'role'> {
  checked: boolean;
  onChange: (next: boolean) => void;
  status?: ToggleStatus;
}

/**
 * The pill switch: `role="switch"`, `aria-checked`, a real `<button>`.
 * Classes are the string WotSettings and SettingsSections both carried.
 */
export default function Toggle({ checked, onChange, className, disabled, status = 'idle', ...rest }: ToggleProps) {
  const loading = status === 'loading';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading ? true : undefined}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 disabled:opacity-50',
        checked ? 'bg-lc-green' : 'bg-lc-border',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          loading ? 'inline-flex items-center justify-center text-lc-muted' : 'inline-block',
          'h-5 w-5 transform rounded-full bg-lc-black transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      >
        {loading && <Spinner size="xs" />}
      </span>
    </button>
  );
}
