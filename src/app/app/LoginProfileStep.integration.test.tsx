/**
 * Integration test against the REAL @nostr-wot/ui login widget.
 *
 * Every other LoginModal test mocks the SDK away, which is why the
 * "cannot type in the generated-profile step" bug survived the suite: the
 * failure lives in the interaction between our DOM enhancements and the
 * SDK's own React state, and mocking the SDK deletes exactly that.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LoginModal from './LoginModal';
import { LocaleProvider } from '@/i18n/context';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const push = vi.hoisted(() => vi.fn());
const publish = vi.fn(() => [Promise.resolve('ok')]);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: { loginWithNsec: vi.fn(), loginWithNip07: vi.fn(), loginWithBunker: vi.fn() },
}));
vi.mock('@nostr-wot/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@nostr-wot/data')>(),
  getPool: () => ({ publish }),
}));
vi.mock('@/lib/blossom', () => ({ uploadToBlossom: vi.fn() }));

async function gotoProfileStep() {
  renderLocalized(<LoginModal methods={['generate']} />);

  const generate = await screen.findByText(/create a new/i, {}, { timeout: 3000 });
  fireEvent.click(generate);

  const ack = await screen.findByRole('checkbox', { name: /backed up my nsec/i }, { timeout: 3000 });
  fireEvent.click(ack);
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i }));

  return await screen.findByPlaceholderText('Builder, chef, occasional cyclist.');
}

describe('generated-profile step (real SDK)', () => {
  it('lets the user type their display name', async () => {
    await gotoProfileStep();
    const user = userEvent.setup();

    const nameInput = document.querySelector<HTMLInputElement>('[data-obelisk-name]');
    expect(nameInput).not.toBeNull();

    await user.type(nameInput!, 'Fabricio');
    await waitFor(() => expect(nameInput!.value).toBe('Fabricio'));
  });

  it('lets the user type the about/description', async () => {
    const aboutInput = await gotoProfileStep();
    const user = userEvent.setup();

    await user.type(aboutInput, 'hello world');
    await waitFor(() => expect((aboutInput as HTMLInputElement).value).toBe('hello world'));
  });

  it('keeps focus in the field being typed into', async () => {
    // The regression: each keystroke re-rendered LoginModal, which re-rendered
    // the SDK profile step and let its autofocused name input steal focus, so
    // only the first character of any word ever landed.
    const aboutInput = await gotoProfileStep();
    const user = userEvent.setup();

    await user.type(aboutInput, 'ab');
    expect(document.activeElement).toBe(aboutInput);
  });
});
