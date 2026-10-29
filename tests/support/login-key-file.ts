import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Saves the new account's key file in the login modal (the SDK's
 * `requireKeyDownload`: Continue stays off until it is). jsdom has no object
 * URLs and no downloads, so both are stubbed; returns the file's text, and
 * keeps its name in `lastKeyFileName`.
 */
/** The name the last saved key file was given (its `download` attribute). */
export let lastKeyFileName = '';

export async function saveNewKeyFile(name: RegExp = /download your key file|descargá tu archivo de clave|baixe seu arquivo de chave/i): Promise<string> {
  let text = '';
  URL.createObjectURL = vi.fn((blob: Blob) => { void blob.text().then((t) => { text = t; }); return 'blob:key'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { lastKeyFileName = this.download; });
  fireEvent.click(await screen.findByRole('button', { name }));
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return text;
}
