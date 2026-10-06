import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OBELISK_SIGNING_KINDS } from '@/utils/nostr-signing-kinds';
import DeveloperSignatureTest from '@/components/settings/DeveloperSignatureTest';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const signEventTemplate = vi.hoisted(() => vi.fn());

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { signEventTemplate: (...args: unknown[]) => signEventTemplate(...args) },
    useSignerReady: () => true,
  });
});

describe('DeveloperSignatureTest', () => {
  beforeEach(() => signEventTemplate.mockReset().mockResolvedValue({ id: 'signed' }));

  it('requests every required signature without publishing anything', async () => {
    renderLocalized(<DeveloperSignatureTest />);
    fireEvent.click(screen.getByTestId('request-mock-signatures'));

    await waitFor(() => expect(signEventTemplate).toHaveBeenCalledTimes(OBELISK_SIGNING_KINDS.length));
    expect(signEventTemplate.mock.calls.map(([template]) => template.kind)).toEqual(OBELISK_SIGNING_KINDS);
    expect(signEventTemplate.mock.calls.find(([template]) => template.kind === 22242)?.[0]).toMatchObject({
      content: '',
      tags: expect.arrayContaining([
        ['relay', 'wss://public.obelisk.ar'],
        ['challenge', 'obelisk-developer-signature-test'],
      ]),
    });
    expect(await screen.findByRole('status')).toHaveTextContent(`${OBELISK_SIGNING_KINDS.length} accepted · 0 rejected`);
  });
});
