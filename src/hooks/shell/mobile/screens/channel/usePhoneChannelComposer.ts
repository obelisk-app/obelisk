import { useImperativeHandle, useRef, type ChangeEvent, type ForwardedRef, type SyntheticEvent } from 'react';
import { useChannelComposer, type ChannelComposerOptions, type ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';

type PhoneComposerOptions = Omit<ChannelComposerOptions, 'inputRef' | 'maxMentionResults'>;

/** Where the caret sits in an input, or its end when the browser does not say. */
function caretOf(el: HTMLInputElement): number {
  return el.selectionStart ?? el.value.length;
}

/**
 * The phone composer over the shared `useChannelComposer`: six mention rows,
 * the input's change and selection events read into value and caret, and the
 * handle `ChannelScreen` drops files through.
 */
export function usePhoneChannelComposer(options: PhoneComposerOptions, ref: ForwardedRef<ComposerHandle>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composer = useChannelComposer({ ...options, inputRef, maxMentionResults: 6 });
  const { onPickFiles } = composer;
  useImperativeHandle(ref, () => ({ pickFiles: (files) => { void onPickFiles(files); } }), [onPickFiles]);
  return {
    ...composer,
    inputRef,
    onInputChange: (e: ChangeEvent<HTMLInputElement>) => composer.onInput(e.target.value, caretOf(e.target)),
    onInputSelect: (e: SyntheticEvent<HTMLInputElement>) => composer.onSelect(e.currentTarget.value, caretOf(e.currentTarget)),
  };
}
