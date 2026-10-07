import { nsecToBytes } from '@nostr-wot/data';
import type { Translate } from '@/i18n/keys';
import { randomProfileName } from '@/utils/identity/display-name';
import { createFilePicker, uploadProfileMedia, type ProfileDraft } from './profile-media-pickers';

/**
 * Enhances the login SDK's generated-profile step from outside its React
 * tree: native media pickers, a suggested name, and the "optional" copy
 * moved onto the one optional field. Watches the modal overlay and re-applies
 * on every SDK re-render; returns the cleanup.
 */
export function attachGeneratedProfileEnhancements(t: Translate, onDraftChange: (patch: ProfileDraft) => void): () => void {
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
    // suggestion anyway: there is nothing to skip.
    //
    // Hidden rather than removed: the SDK owns this subtree and re-renders
    // it, and removing a node React still holds a reference to is how you
    // get NotFoundError on the next update.
    modal.querySelector<HTMLElement>('.nui-profile-skip')?.setAttribute('hidden', '');
    for (const paragraph of modal.querySelectorAll<HTMLElement>('p')) {
      if (paragraph.textContent?.trim().startsWith('Optional.')) { // i18n-exempt: matches the SDK's English copy
        paragraph.hidden = true;
      }
    }

    // Optionality moves onto the one field that actually is optional.
    for (const label of modal.querySelectorAll<HTMLElement>('.nui-profile-field-label')) {
      if (label.textContent?.trim() === 'About' && !label.dataset.obeliskOptional) { // i18n-exempt: matches the SDK's English label
        label.dataset.obeliskOptional = 'true';
        label.textContent = t('shell.login.profile.aboutOptional');
      }
    }

    // The name field belongs to the SDK and is a React *controlled* input, so
    // its value is owned by React state we cannot reach from out here. Writing
    // to it via the native setter desyncs React's value tracker: the text shows
    // up, but React's own state never advances, and the first keystroke gets
    // slammed back by `restoreControlledState`, so the field becomes untypeable.
    // So we never touch `value`. The suggested name rides on `placeholder` and
    // is carried to publish through the draft, which `publishGeneratedProfile`
    // already falls back to when the user leaves the field empty.
    const nameInput = modal.querySelector<HTMLInputElement>(
      'input[placeholder="Satoshi"], input[data-obelisk-name]', // i18n-exempt: selector for the SDK's placeholder
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
      button.title = t('shell.login.profile.suggestName');
      button.setAttribute('aria-label', t('shell.login.profile.suggestName'));
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
    const pick = (kind: 'picture' | 'banner') => (file: File, picker: HTMLLabelElement) =>
      void uploadProfileMedia({ kind, file, picker, error, secretKey, t, onDraftChange });

    const bannerPrompt = t('shell.login.profile.uploadBanner');
    media.append(createFilePicker('banner', bannerPrompt, pick('banner')), createFilePicker('picture', bannerPrompt, pick('picture')), error);
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
}
