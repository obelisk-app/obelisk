'use client';

import { useEffect } from 'react';
import { nsecToBytes } from '@nostr-wot/data';

const ADJECTIVES = ['Brave', 'Calm', 'Cosmic', 'Electric', 'Lucky', 'Lunar', 'Mighty', 'Neon', 'Quiet', 'Swift', 'Wild', 'Wise'];
const NOUNS = ['Badger', 'Condor', 'Falcon', 'Fox', 'Jaguar', 'Llama', 'Otter', 'Puma', 'Raven', 'Tiger', 'Wolf', 'Zorro'];

type ProfileDraft = { name?: string; about?: string; picture?: string; banner?: string };

export function randomProfileName(random = Math.random): string {
  return `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]}`;
}

function filePicker(kind: 'picture' | 'banner', onPick: (file: File, picker: HTMLLabelElement) => void): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = `obelisk-media-picker obelisk-${kind}-picker`;
  label.dataset.kind = kind;
  const prompt = document.createElement('span');
  prompt.className = 'obelisk-media-prompt';
  prompt.textContent = kind === 'picture' ? '＋' : 'Upload banner';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) onPick(file, label);
  });
  label.append(prompt, input);
  return label;
}

/** Enhances the SDK's generated-profile step with native media pickers and name generation. */
export default function GeneratedProfileEnhancements({
  onDraftChange = () => {},
}: {
  onDraftChange?: (patch: ProfileDraft) => void;
}): null {
  useEffect(() => {
    let secretKey: Uint8Array | null = null;
    let observer: MutationObserver | null = null;
    let suggestion = '';

    const sync = () => {
      const modal = document.querySelector<HTMLElement>('.obelisk-login-modal');
      if (!modal) return;

      if (!secretKey) {
        const nsec = [...modal.querySelectorAll<HTMLElement>('.nui-key-display')]
          .map((el) => el.textContent?.trim() ?? '')
          .find((value) => value.startsWith('nsec1'));
        if (nsec) secretKey = nsecToBytes(nsec);
      }

      // "Skip for now" and the "Optional, you can fill these in later" line
      // both tell someone who is *already filling the form in* that they
      // needn't have bothered. A profile with no name shows up as a truncated
      // npub everywhere in the app, and the name field is pre-filled with a
      // suggestion anyway — there is nothing to skip.
      //
      // Hidden rather than removed: the SDK owns this subtree and re-renders
      // it, and removing a node React still holds a reference to is how you
      // get NotFoundError on the next update.
      modal.querySelector<HTMLElement>('.nui-profile-skip')?.setAttribute('hidden', '');
      for (const paragraph of modal.querySelectorAll<HTMLElement>('p')) {
        if (paragraph.textContent?.trim().startsWith('Optional.')) {
          paragraph.hidden = true;
        }
      }

      // Optionality moves onto the one field that actually is optional.
      for (const label of modal.querySelectorAll<HTMLElement>('.nui-profile-field-label')) {
        if (label.textContent?.trim() === 'About' && !label.dataset.obeliskOptional) {
          label.dataset.obeliskOptional = 'true';
          label.textContent = 'About (optional)';
        }
      }

      // The name field belongs to the SDK and is a React *controlled* input, so
      // its value is owned by React state we cannot reach from out here. Writing
      // to it via the native setter desyncs React's value tracker: the text shows
      // up, but React's own state never advances, and the first keystroke gets
      // slammed back by `restoreControlledState` — the field becomes untypeable.
      // So we never touch `value`. The suggested name rides on `placeholder` and
      // is carried to publish through the draft, which `publishGeneratedProfile`
      // already falls back to when the user leaves the field empty.
      const nameInput = modal.querySelector<HTMLInputElement>(
        'input[placeholder="Satoshi"], input[data-obelisk-name]',
      );
      if (nameInput && !nameInput.dataset.obeliskName) {
        nameInput.dataset.obeliskName = 'true';
        nameInput.classList.add('obelisk-name-input');
        suggestion = randomProfileName();
        nameInput.placeholder = suggestion;
        onDraftChange({ name: suggestion });

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'obelisk-random-name';
        button.textContent = '🎲';
        button.title = 'Suggest another name';
        button.setAttribute('aria-label', 'Suggest another name');
        button.addEventListener('click', () => {
          suggestion = randomProfileName();
          nameInput.placeholder = suggestion;
          onDraftChange({ name: nameInput.value.trim() || suggestion });
        });
        nameInput.insertAdjacentElement('afterend', button);

        // Once the user types their own name the suggestion is moot, so the
        // reroll control steps out of the way rather than sitting there inert.
        nameInput.addEventListener('input', () => {
          const typed = nameInput.value.trim();
          button.hidden = typed.length > 0;
          onDraftChange({ name: typed || suggestion });
        });
      }

      const aboutInput = modal.querySelector<HTMLInputElement>('input[placeholder*="Builder"]');
      if (aboutInput && !aboutInput.dataset.obeliskTracked) {
        aboutInput.dataset.obeliskTracked = 'true';
        aboutInput.addEventListener('input', () => onDraftChange({ about: aboutInput.value }));
      }

      const pictureInput = modal.querySelector<HTMLInputElement>('input[type="url"][placeholder*="avatar"]');
      if (!pictureInput || !secretKey || pictureInput.parentElement?.querySelector('.obelisk-profile-media')) return;
      pictureInput.hidden = true;
      pictureInput.previousElementSibling?.classList.add('obelisk-hidden-profile-label');

      const media = document.createElement('div');
      media.className = 'obelisk-profile-media';
      const error = document.createElement('span');
      error.className = 'obelisk-upload-error';

      const upload = async (kind: 'picture' | 'banner', file: File, picker: HTMLLabelElement) => {
        if (!file.type.startsWith('image/')) {
          error.textContent = 'Choose an image file.';
          return;
        }
        const prompt = picker.querySelector<HTMLElement>('.obelisk-media-prompt');
        const input = picker.querySelector<HTMLInputElement>('input');
        if (prompt) prompt.textContent = 'Uploading…';
        if (input) input.disabled = true;
        error.textContent = '';
        try {
          const { uploadToBlossom } = await import('@/lib/blossom');
          const url = await uploadToBlossom(file, secretKey ?? undefined);
          let image = picker.querySelector('img');
          if (!image) {
            image = document.createElement('img');
            image.alt = '';
            picker.prepend(image);
          }
          image.src = url;
          picker.classList.add('has-image');
          if (prompt) prompt.textContent = kind === 'picture' ? 'Change' : 'Change banner';
          // Same rule as the name field: never write into the SDK's controlled
          // input. The upload reaches publish through the draft instead.
          onDraftChange({ [kind]: url });
        } catch (uploadError) {
          error.textContent = uploadError instanceof Error ? uploadError.message : 'Upload failed';
          if (prompt) prompt.textContent = kind === 'picture' ? 'Retry' : 'Retry banner';
        } finally {
          if (input) input.disabled = false;
        }
      };

      const bannerPicker = filePicker('banner', (file, picker) => void upload('banner', file, picker));
      const picturePicker = filePicker('picture', (file, picker) => void upload('picture', file, picker));
      media.append(bannerPicker, picturePicker, error);
      pictureInput.insertAdjacentElement('afterend', media);
    };

    const attach = () => {
      const overlay = document.querySelector('.nui-modal-overlay');
      if (!overlay) return false;
      observer = new MutationObserver(sync);
      observer.observe(overlay, { childList: true, subtree: true });
      sync();
      return true;
    };

    if (attach()) return () => observer?.disconnect();
    const interval = window.setInterval(() => {
      if (attach()) window.clearInterval(interval);
    }, 100);
    return () => {
      window.clearInterval(interval);
      observer?.disconnect();
    };
  }, [onDraftChange]);

  return null;
}
