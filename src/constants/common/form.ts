import type { MessageKey } from '@/i18n/keys';

/** A form's values: one entry per field, named as the inputs are. */
export type FormValues = Record<string, unknown>;

/**
 * One form, described: its starting values, what must hold before it may be
 * sent, and what sending does. A form keeps only this (as a small builder
 * next to the service it calls, `src/services/<module>/<name>-form.ts`);
 * the state, the busy flag and the error line are `useForm`'s.
 */
export interface FormSpec<V extends FormValues, R = unknown> {
  /** The starting values. Read once, on the first render; `reset` and `adopt` replace them later. */
  initial: V | (() => V);
  /**
   * Whether a submit may go ahead at all (a blank required field, no signer).
   * A submit that may not does nothing and says nothing; the submit button
   * reads it through `canSubmit`.
   */
  ready?: (values: V) => boolean;
  /** The first problem with the values, as the message key to show, or `null`. Nothing is sent while there is one. */
  validate?: (values: V) => MessageKey | null;
  /** The side effect: publish, upload, navigate. Its result goes to `onSuccess`. */
  submit: (values: V) => Promise<R> | R;
  /**
   * The message when `submit` throws an error that carries no code (a coded
   * error reads its own sentence, `errorText`). A function picks it by error.
   */
  failure?: MessageKey | ((error: unknown) => MessageKey);
  /** After a submit that went through: close the dialog, hand the new id on. */
  onSuccess?: (result: R, values: V) => void;
  /** Back to the starting values after a submit that went through. */
  resetOnSuccess?: boolean;
}

