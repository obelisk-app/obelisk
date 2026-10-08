'use client';

import { useCallback, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { FormSpec, FormValues } from '@/constants/common/form';
import { errorText } from '@/utils/errors/error-text';
import { sameValues } from '@/utils/common/form-rules';

/** The fields of `V` that hold text, the ones `field(name)` can bind to an input. */
export type TextFieldOf<V> = { [K in keyof V]: V[K] extends string ? K : never }[keyof V];

/** Props that bind a text input or text area to one field: `<Input {...form.field('name')} />`. */
export interface FieldBinding {
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

/**
 * The one form hook. Every form in the app, desktop or phone, dialog, sheet
 * or page, reads its values, its busy flag and its error from here:
 *
 *   const form = useForm(addRelayForm(onAdded));
 *   <Form form={form} error={form.error}>
 *     <Input {...form.field('url')} />
 *   </Form>
 *
 * - `submit` guards a second submit while one is in flight (also within one
 *   tick, before the busy flag has re-rendered the button), clears the last
 *   error, checks `ready` and `validate`, runs the spec's `submit`, and turns
 *   a thrown value into a sentence in the reader's language.
 * - `dirty` turns true on the first edit; `adopt` replaces the values only
 *   while it is false, so values that arrive late (a profile from a relay)
 *   never clobber typing.
 * - `id` is the `<form>`'s id, for a submit button outside it
 *   (`ModalFooter` `form`, `SheetActions` `form`).
 */
export function useForm<V extends FormValues, R = unknown>(spec: FormSpec<V, R>) {
  const t = useTranslations();
  const id = useId();
  const [values, setValuesState] = useState<V>(spec.initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const inFlight = useRef(false);
  const edited = useRef(false);
  const startedFrom = useRef<V>(values);

  // The setters are stable, so an effect may list `adopt` or `reset` in its deps.
  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => {
    edited.current = true;
    setDirty(true);
    setValuesState((current) => ({ ...current, [name]: value }));
  }, []);
  const setValues = useCallback((patch: Partial<V>) => {
    edited.current = true;
    setDirty(true);
    setValuesState((current) => ({ ...current, ...patch }));
  }, []);
  const reset = useCallback((next?: V) => {
    const base = next ?? startedFrom.current;
    startedFrom.current = base;
    edited.current = false;
    setDirty(false);
    setError(null);
    setValuesState(base);
  }, []);
  const adopt = useCallback((next: V) => {
    if (edited.current) return;
    startedFrom.current = next;
    // Equal values keep the current object, so a caller that builds them
    // afresh on every render does not render again.
    setValuesState((current) => (sameValues(current, next) ? current : next));
  }, []);
  const field = (name: TextFieldOf<V>): FieldBinding => ({
    name: String(name),
    value: values[name] as string,
    onChange: (event) => set(name, event.target.value as V[typeof name]),
  });

  const ready = spec.ready ? spec.ready(values) : true;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (!ready) return;
    const problem = spec.validate?.(values) ?? null;
    if (problem) {
      setError(t(problem));
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await spec.submit(values);
      if (spec.resetOnSuccess) reset();
      spec.onSuccess?.(result, values);
    } catch (err) {
      const fallback = typeof spec.failure === 'function' ? spec.failure(err) : spec.failure;
      setError(errorText(t, err, fallback));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return {
    id,
    values,
    set,
    setValues,
    field,
    dirty,
    submitting,
    error,
    setError,
    /** `ready` holds and nothing is in flight: what a submit button's `disabled` reads. */
    canSubmit: ready && !submitting,
    submit,
    reset,
    adopt,
  };
}

export type FormState<V extends FormValues, R = unknown> = ReturnType<typeof useForm<V, R>>;
