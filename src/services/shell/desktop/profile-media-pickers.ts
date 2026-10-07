import type { Translate } from '@/i18n/keys';
import { errorText } from '@/utils/errors/error-text';
import { takePickedFile } from '@/utils/media/upload/picked-file';

/**
 * The picture and banner pickers the generated-profile step gains in place
 * of the SDK's picture URL field. Plain DOM: the SDK owns the modal's React
 * tree, so these are built and wired by hand (see `generated-profile.ts`).
 */

export type ProfileDraft = { name?: string; about?: string; picture?: string; banner?: string };
export type MediaKind = 'picture' | 'banner';

/** A label wrapping a hidden file input; `onPick` gets the chosen file and the label. */
export function createFilePicker(
  kind: MediaKind,
  bannerPrompt: string,
  onPick: (file: File, picker: HTMLLabelElement) => void,
): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = `obelisk-media-picker obelisk-${kind}-picker`;
  label.dataset.kind = kind;
  const prompt = document.createElement('span');
  prompt.className = 'obelisk-media-prompt';
  prompt.textContent = kind === 'picture' ? '＋' : bannerPrompt;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = takePickedFile(input);
    if (file) onPick(file, label);
  });
  label.append(prompt, input);
  return label;
}

/**
 * Upload a picked image to Blossom under the new key, show it in the picker
 * and hand the URL to the draft. Never written into the SDK's controlled
 * input: the upload reaches publish through the draft instead.
 */
export async function uploadProfileMedia({ kind, file, picker, error, secretKey, t, onDraftChange }: {
  kind: MediaKind;
  file: File;
  picker: HTMLLabelElement;
  error: HTMLElement;
  secretKey: Uint8Array | null;
  t: Translate;
  onDraftChange: (patch: ProfileDraft) => void;
}): Promise<void> {
  if (!file.type.startsWith('image/')) {
    error.textContent = t('shell.login.profile.chooseImage');
    return;
  }
  const prompt = picker.querySelector<HTMLElement>('.obelisk-media-prompt');
  const input = picker.querySelector<HTMLInputElement>('input');
  if (prompt) prompt.textContent = t('shell.login.profile.uploading');
  if (input) input.disabled = true;
  error.textContent = '';
  try {
    const { uploadToBlossom } = await import('@/services/media/blossom');
    const url = await uploadToBlossom(file, secretKey ?? undefined);
    let image = picker.querySelector('img');
    if (!image) {
      image = document.createElement('img');
      image.alt = '';
      picker.prepend(image);
    }
    image.src = url;
    picker.classList.add('has-image');
    if (prompt) prompt.textContent = kind === 'picture' ? t('shell.login.profile.change') : t('shell.login.profile.changeBanner');
    onDraftChange({ [kind]: url });
  } catch (uploadError) {
    error.textContent = errorText(t, uploadError, 'shell.login.profile.uploadFailed');
    if (prompt) prompt.textContent = kind === 'picture' ? t('shell.login.profile.retry') : t('shell.login.profile.retryBanner');
  } finally {
    if (input) input.disabled = false;
  }
}
