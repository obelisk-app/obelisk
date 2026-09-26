import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import type { Locale } from '@/i18n/index';
import { ConfirmDialogHost, confirmDialog } from './ConfirmDialog';

function mountHost(locale: Locale = 'en') {
  return render(<LocaleProvider initialLocale={locale}><ConfirmDialogHost /></LocaleProvider>);
}

/** Open a dialog inside act() so the host re-renders before we query it. */
function ask(options: Parameters<typeof confirmDialog>[0]): Promise<boolean> {
  let result!: Promise<boolean>;
  act(() => { result = confirmDialog(options); });
  return result;
}

afterEach(() => cleanup());

describe('confirmDialog', () => {
  it('resolves true on confirm and closes', async () => {
    mountHost();
    const answer = ask({ title: 'Delete this message?', message: 'It will be removed.' });

    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete this message?');
    expect(screen.getByText('It will be removed.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it.each([
    ['the cancel button', () => fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['a backdrop click', () => fireEvent.click(screen.getByTestId('confirm-dialog'))],
  ])('resolves false on %s', async (_label, dismiss) => {
    mountHost();
    const answer = ask({ title: 'Remove relay?' });
    act(() => dismiss());
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('puts focus on Cancel, so a stray Enter never confirms', () => {
    mountHost();
    void ask({ title: 'Delete pack?' });
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
  });

  it('labels its buttons in the app language, not the OS one', () => {
    mountHost('es');
    void ask({ title: '¿Eliminar?' });
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Eliminar');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancelar');
  });

  it('uses caller-supplied labels', () => {
    mountHost();
    void ask({ title: 'Leave relay?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Leave');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Stay');
  });

  it('cancels the open dialog when a second one is requested', async () => {
    mountHost();
    const first = ask({ title: 'First?' });
    const second = ask({ title: 'Second?' });
    await expect(first).resolves.toBe(false);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Second?');
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await expect(second).resolves.toBe(true);
  });

  it('answers false when no host is mounted, the safe default for a delete', async () => {
    await expect(confirmDialog({ title: 'Delete?' })).resolves.toBe(false);
  });

  it('releases a waiting caller when the host unmounts', async () => {
    const { unmount } = mountHost();
    const answer = ask({ title: 'Delete?' });
    unmount();
    await expect(answer).resolves.toBe(false);
  });
});

describe('native confirm()', () => {
  // The browser dialog can't be styled or translated, and some webviews
  // suppress it (it returns false, so the action silently does nothing).
  it('is not used anywhere in src/', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
        readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '').trim();
          if (code.startsWith('*')) return;
          if (/(^|[^\w.])(window\.)?confirm\(/.test(code)) offenders.push(`${path}:${i + 1}`);
        });
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
