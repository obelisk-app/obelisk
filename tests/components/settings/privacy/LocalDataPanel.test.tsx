import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import LocalDataPanel from '@/components/settings/privacy/LocalDataPanel';
import { LOCAL_DATA_CATEGORIES } from '@/services/local-data';

function renderPanel(locale: 'en' | 'es' | 'pt' = 'en', mobile = false) {
  return render(
    <LocaleProvider initialLocale={locale}>
      <LocalDataPanel mobile={mobile} />
      <ConfirmDialogHost />
    </LocaleProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('LocalDataPanel', () => {
  it('lists every category with its purpose and a remove action, plus remove everything', async () => {
    renderPanel();
    const t = translator('en');
    for (const c of LOCAL_DATA_CATEGORIES) {
      const row = screen.getByTestId(`local-data-row-${c.id}`);
      expect(row).toHaveTextContent(t(c.titleKey));
      expect(row).toHaveTextContent(t(c.purposeKey));
      expect(screen.getByTestId(`local-data-remove-${c.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('local-data-remove-all')).toHaveTextContent('Remove everything');
    expect(screen.getByTestId('local-data-learn-more')).toHaveAttribute('href', '/help/local-data');
    await waitFor(() => expect(screen.getByTestId('local-data-size-preferences')).toHaveTextContent('Nothing stored'));
  });

  it('shows a size where there is data and disables remove where there is none', async () => {
    localStorage.setItem('obelisk:preferences', 'x'.repeat(600));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('local-data-size-preferences')).toHaveTextContent('About 1 KB'));
    expect(screen.getByTestId('local-data-remove-preferences')).toBeEnabled();
    expect(screen.getByTestId('local-data-remove-channels')).toBeDisabled();
  });

  it('confirms with the category name and what will happen', async () => {
    localStorage.setItem('obelisk-dex/session', '{}');
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('local-data-remove-login')).toBeEnabled());
    fireEvent.click(screen.getByTestId('local-data-remove-login'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('Your login on this device (encrypted)');
    expect(dialog).toHaveTextContent('To log in again you need your key');
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
    expect(localStorage.getItem('obelisk-dex/session')).toBe('{}');
  });

  it('confirms remove everything in the reader language', async () => {
    renderPanel('es');
    fireEvent.click(screen.getByTestId('local-data-remove-all'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('¿Borrar todo de este dispositivo?');
    expect(dialog).toHaveTextContent('Se cierra tu sesión');
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
  });

  it('renders on the phone too', () => {
    renderPanel('pt', true);
    expect(screen.getByTestId('local-data-panel')).toHaveTextContent('Apagar tudo deste dispositivo');
  });
});
