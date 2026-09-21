import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

const mocks = vi.hoisted(() => ({
  uploadToBlossom: vi.fn().mockResolvedValue('https://cdn.example/pasted.png'),
  publishNote: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/blossom', () => ({ uploadToBlossom: mocks.uploadToBlossom }));

vi.mock('@/lib/social/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/publish')>()),
  publishNote: mocks.publishNote,
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import NoteComposer from './NoteComposer';

const imageFile = (name = 'shot.png') => {
  const file = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: 1000 });
  return file;
};

const renderComposer = () => render(
  <LocaleProvider initialLocale="en"><NoteComposer /></LocaleProvider>,
);

beforeEach(() => {
  mocks.uploadToBlossom.mockClear();
  mocks.publishNote.mockClear();
});

describe('NoteComposer image input', () => {
  it('uploads an image pasted from the clipboard', async () => {
    // Pasting a screenshot is how most images actually reach a composer; the
    // file picker used to be the only way in.
    renderComposer();
    const file = imageFile();
    fireEvent.paste(screen.getByTestId('note-composer'), {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [] },
    });

    // Generous timeout: jsdom never fires image load/error, so dimension
    // measuring falls through its 3s guard before the upload runs.
    await waitFor(() => expect(mocks.uploadToBlossom).toHaveBeenCalledWith(file), { timeout: 5000 });
    await waitFor(() => {
      expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value)
        .toContain('https://cdn.example/pasted.png');
    }, { timeout: 5000 });
  });

  it('uploads an image dropped onto the composer', async () => {
    renderComposer();
    const file = imageFile('dropped.png');
    fireEvent.drop(screen.getByTestId('note-composer'), {
      dataTransfer: { items: [], files: [file] },
    });
    await waitFor(() => expect(mocks.uploadToBlossom).toHaveBeenCalledWith(file), { timeout: 5000 });
  });

  it('leaves a plain text paste alone', async () => {
    // Swallowing every paste would break typing a URL into the textarea.
    renderComposer();
    fireEvent.paste(screen.getByTestId('note-composer'), {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain' }], files: [] },
    });
    expect(mocks.uploadToBlossom).not.toHaveBeenCalled();
  });

  it('ignores a pasted non-image file', async () => {
    renderComposer();
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.paste(screen.getByTestId('note-composer'), {
      clipboardData: { items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => pdf }], files: [] },
    });
    expect(mocks.uploadToBlossom).not.toHaveBeenCalled();
  });
});
