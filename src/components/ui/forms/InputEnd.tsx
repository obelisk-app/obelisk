import type { ReactNode } from 'react';
import Button from '../buttons/Button';
import Spinner from '../feedback/Spinner';
import { CloseIcon, EyeIcon, EyeOffIcon } from '@/assets/icons';

export { endSlotCount } from '@/utils/style/input-end-slots';

/** `loading` shows a spinner at the end of the control and marks it busy. */
export type InputStatus = 'idle' | 'loading';

/** A clear button at the end of the control, shown while it holds a value. */
export interface InputClear {
  /** Accessible name of the button, already translated ("Clear search"). */
  label: string;
  onClear: () => void;
}

/**
 * A masked field with a show/hide button.
 * - `password`: an ordinary secret.
 * - `nsec`: a Nostr private key. Also monospace, and opted out of
 *   autocomplete, spellcheck, autocorrect and autocapitalise, so the key is
 *   never offered to a dictionary or a form-history list.
 */
export type InputSecretKind = 'password' | 'nsec';

export interface InputSecret {
  kind: InputSecretKind;
  /** Accessible name of the button while the value is hidden ("Show key"). */
  showLabel: string;
  /** Accessible name of the button while the value is shown ("Hide key"). */
  hideLabel: string;
}

export interface InputEndProps {
  controlId: string;
  status: InputStatus;
  /** Present only while the clear button should show. */
  clear?: InputClear;
  secret?: InputSecret;
  revealed: boolean;
  onToggleReveal: () => void;
  onClear: () => void;
  suffix?: ReactNode;
}

/**
 * The end of an adorned Input: spinner, clear, reveal, then the caller's own
 * suffix, in that order, in one overlaid row.
 */
export default function InputEnd({ controlId, status, clear, secret, revealed, onToggleReveal, onClear, suffix }: InputEndProps) {
  return (
    <span className="absolute inset-y-0 right-2 flex items-center gap-1">
      {status === 'loading' && <Spinner size="sm" />}
      {clear && (
        <Button variant="ghost" size="icon" aria-label={clear.label} aria-controls={controlId} onClick={onClear}>
          <CloseIcon size={14} />
        </Button>
      )}
      {secret && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={revealed ? secret.hideLabel : secret.showLabel}
          aria-controls={controlId}
          onClick={onToggleReveal}
        >
          {revealed ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </Button>
      )}
      {suffix}
    </span>
  );
}
