import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { BridgeImpl } from '@/services/nostr-bridge';
import RelayInviteSettings from '@/components/settings/invite/RelayInviteSettings';

vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pk: string) => (pk === 'c'.repeat(64) ? { name: 'Carol', picture: null } : { name: null, picture: null }),
}));

const A = 'wss://a.example';
const B = 'wss://b.example';

const signEventTemplate = vi.fn(async (t: { kind: number; tags: string[][]; content: string; created_at?: number }) => ({
  ...t, id: 'id', pubkey: 'pk', sig: 'sig', created_at: t.created_at ?? 0,
}));

function me(over: Record<string, unknown> = {}) {
  return {
    pubkey: 'pk', admitted: true, basis: null, can_mint: false, is_admin: false,
    admits_total: null, admits_used: 0, admits_left: null, codes_left: null, invited_by: null, grant: null, codes: [], ...over,
  };
}

/** The `u` tag of the NIP-98 event a request carried. */
function signedFor(init: RequestInit | undefined): string | undefined {
  const header = (init?.headers as Record<string, string> | undefined)?.Authorization;
  if (!header) return undefined;
  const event = JSON.parse(atob(header.slice('Nostr '.length))) as { tags: string[][] };
  return event.tags.find((tag) => tag[0] === 'u')?.[1];
}

let n = 0;
function render(answers: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const { host, pathname } = new URL(url);
    if (pathname === '/api/invites/me' && answers[host]) return answers[host]();
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const bridge = fakeBridge(
    { currentRelayUrl: A, configuredRelays: [A, B], myPubkey: `${++n}`.padStart(64, 'f') },
    { signEventTemplate } as unknown as Partial<BridgeImpl>,
  );
  renderWithBridge(<RelayInviteSettings />, bridge);
  return fetchMock;
}

const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RelayInviteSettings', () => {
  it('names the relay the links are for, and switches relay without leaving the panel', async () => {
    const fetchMock = render({
      'a.example': ok(me({ basis: 'owner', can_mint: true, admits_total: 10, admits_used: 3, admits_left: 7 })),
      'b.example': ok(me({ basis: 'grant', can_mint: true, admits_total: 4, admits_used: 0, admits_left: 4, grant: { max_uses_per_code: 4, max_ttl_secs: 3 * 86_400 }, invited_by: { code: 'x', pubkey: 'c'.repeat(64), npub: '', at: 1_790_000_000 } })),
    });

    const picker = screen.getByTestId('relay-invite-relay-picker') as HTMLSelectElement;
    expect(picker.value).toBe(A);
    expect([...picker.options].map((o) => o.value)).toEqual([A, B]);
    expect(picker.options[0].textContent).toContain('open now');

    expect(await screen.findByTestId('relay-invite-explanation')).toHaveTextContent('As the owner of a.example you can bring in up to 10 people, in one link or several.');
    expect(screen.getByTestId('relay-invites-quota')).toHaveTextContent('7 of 10 left');
    expect((screen.getByTestId('relay-invite-people') as HTMLInputElement).value).toBe('7');
    expect((screen.getByTestId('relay-invite-days') as HTMLInputElement).value).toBe('7');

    fireEvent.change(picker, { target: { value: B } });
    await waitFor(() => expect(screen.getByTestId('relay-invite-explanation')).toHaveTextContent('An admin of b.example lets you invite up to 4 people.'));
    expect(screen.getByTestId('relay-invites-quota')).toHaveTextContent('4 of 4 left');
    expect((screen.getByTestId('relay-invite-days') as HTMLInputElement).value).toBe('3');
    expect(screen.getByTestId('relay-invite-invited-by')).toHaveTextContent('Invited by Carol');

    // Each relay was asked with a signature for its own URL.
    const signed = fetchMock.mock.calls.map(([, init]) => signedFor(init)).filter(Boolean);
    expect(signed).toEqual(['https://a.example/api/invites/me', 'https://b.example/api/invites/me']);

    // Back to the first: its answer is remembered, nothing is signed again.
    fireEvent.change(picker, { target: { value: A } });
    await waitFor(() => expect(screen.getByTestId('relay-invites-quota')).toHaveTextContent('7 of 10 left'));
    expect(fetchMock.mock.calls.filter(([, init]) => signedFor(init))).toHaveLength(2);
  });

  it('explains who can invite to someone who cannot, with no form', async () => {
    render({ 'a.example': ok(me()) });
    expect(await screen.findByTestId('relay-invite-explanation')).toHaveTextContent("Only this relay's owner, admins and reference accounts can create invite links (10 people each).");
    expect(screen.queryByTestId('relay-invite-create-form')).toBeNull();
  });

  it('keeps the links of a spent allowance, past ones folded away', async () => {
    render({
      'a.example': ok(me({
        basis: 'admin', is_admin: true, can_mint: false, admits_total: 10, admits_used: 10, admits_left: 0,
        codes: [
          { code: 'live', label: 'live one', status: 'active', created_at: 2, max_uses: 2, uses: 1, expires_at: null, redemptions: [] },
          { code: 'old', label: 'old one', status: 'exhausted', created_at: 1, max_uses: 8, uses: 8, expires_at: null, redemptions: [] },
        ],
      })),
    });
    expect(await screen.findByTestId('relay-invites-spent')).toBeInTheDocument();
    expect(screen.queryByTestId('relay-invite-create-form')).toBeNull();
    expect(screen.getByText('live one')).toBeInTheDocument();
    expect(screen.queryByText('old one')).toBeNull();
    fireEvent.click(screen.getByTestId('relay-invites-past-toggle'));
    expect(screen.getByText('old one')).toBeInTheDocument();
  });

  it('shows a failure with Retry, and asks again on Retry', async () => {
    let calls = 0;
    const fetchMock = render({
      'a.example': () => (++calls === 1 ? new Response('{"error":"down"}', { status: 503 }) : new Response(JSON.stringify(me({ basis: 'owner', can_mint: true, admits_total: 10, admits_left: 10 })), { status: 200 })),
    });
    expect(await screen.findByTestId('relay-invites-failed')).toHaveTextContent("Could not reach a.example's invite service.");
    fireEvent.click(screen.getByTestId('relay-invites-retry'));
    expect(await screen.findByTestId('relay-invite-explanation')).toHaveTextContent('As the owner of a.example');
    expect(fetchMock.mock.calls.filter(([, init]) => signedFor(init))).toHaveLength(2);
  });
});
