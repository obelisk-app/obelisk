/**
 * Against the REAL @nostr-wot/ui login widget, in Spanish: the widget's own
 * copy (methods, paste step, new key, profile step) reads in the reader's
 * language, with no em dash, and the generated-profile enhancements still find
 * the fields whose placeholders were translated.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { saveNewKeyFile } from '@tests/support/login-key-file';
import LoginModal from '@/app/[locale]/app/login/LoginModal';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const push = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));
vi.mock('@nostr-wot/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@nostr-wot/data')>(),
  getPool: () => ({ publish: vi.fn(() => [Promise.resolve('ok')]) }),
}));
vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: vi.fn() }));

const renderEs = (methods: Array<'nip07' | 'import' | 'generate'>) => renderWithBridge(
  <LoginModal methods={methods} />,
  fakeBridge({ isLoggedIn: false, myPubkey: null }, { loginWithNsec: vi.fn(), loginWithNip07: vi.fn(), loginWithBunker: vi.fn() }),
  { locale: 'es' },
);

const dialogText = () => document.querySelector('.obelisk-login-modal')?.textContent ?? '';

describe('the SDK login widget in Spanish (real SDK)', () => {
  it('names every method and the extension offer in Spanish', async () => {
    renderEs(['nip07', 'import', 'generate']);
    expect(await screen.findByText('Crear una cuenta nueva')).toBeInTheDocument();
    // No extension in jsdom: its method is left out, and only the offer to install one shows.
    expect(screen.queryByText('Extensión del navegador')).toBeNull();
    expect(screen.getByText('Ya tengo una cuenta')).toBeInTheDocument();
    expect(screen.getByText('Clave privada o archivo de clave')).toBeInTheDocument();
    expect(screen.getByText('Pegá tu nsec o subí el archivo de clave que guardaste')).toBeInTheDocument();
    expect(screen.getByText('Genera un par de claves nuevo en este dispositivo')).toBeInTheDocument();
    expect(screen.getByText('Instalá la extensión Nostr WoT')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Conectate a Nostr');
    expect(dialogText()).not.toMatch(/Browser extension|Private key or key file|Create a new account|I already have|\u2014/);
  });

  it('shows the paste step in Spanish', async () => {
    renderEs(['import']);
    fireEvent.click(await screen.findByText('Clave privada o archivo de clave'));
    expect(await screen.findByPlaceholderText('nsec1… o hex de 64 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Subir archivo de clave')).toBeInTheDocument();
    expect(screen.getByText('El .txt que guardaste al crear la cuenta')).toBeInTheDocument();
    await waitFor(() => expect(dialogText()).toContain('Pegar tu clave privada en una página web es riesgoso.'));
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Volver' })).toBeInTheDocument();
  });

  it('shows the new key and the profile step in Spanish, without em dashes', async () => {
    renderEs(['generate']);
    fireEvent.click(await screen.findByText('Crear una cuenta nueva'));
    expect(await screen.findByText('Tu clave nueva')).toBeInTheDocument();
    await waitFor(() => expect(dialogText()).toContain('Guardá una copia antes de continuar.'));
    expect(screen.getByText('Clave privada (nsec): guardala en secreto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar nsec' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar .txt' })).toBeNull();
    expect(screen.getByText('Guardalo en un lugar seguro. Para volver a entrar, subilo o pegá la nsec que tiene adentro.')).toBeInTheDocument();
    expect(dialogText()).not.toContain('\u2014');

    fireEvent.click(screen.getByRole('checkbox', { name: /Ya guardé una copia de mi nsec/ }));
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    const file = await saveNewKeyFile();
    expect(file).toMatch(/nsec1[02-9ac-hj-np-z]{58}/);
    expect(await screen.findByRole('button', { name: '✓ Archivo de clave guardado (descargar de nuevo)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('Armá tu perfil')).toBeInTheDocument();
    const about = await screen.findByPlaceholderText('Programo, cocino, salgo en bici.');
    await waitFor(() => expect(about).toHaveAttribute('data-obelisk-tracked', 'true'));
    expect(screen.getByRole('button', { name: 'Guardar el perfil y continuar' })).toBeInTheDocument();
  });
});
