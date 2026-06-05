import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  buildGroupMessagesUrl,
  discoverIndexedBootstrap,
  fetchIndexedBootstrap,
  parseIndexedBootstrapPayload,
} from './indexed-bootstrap';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function rawEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'evt',
    pubkey: 'pub',
    created_at: 123,
    kind: 39000,
    tags: [['d', 'general']],
    content: '',
    sig: 'sig',
    ...overrides,
  };
}

describe('indexed bootstrap helpers', () => {
  it('discovers a v1 NIP-98 capability from NIP-11 relay info', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      obelisk: {
        indexed_bootstrap: {
          version: 1,
          url: '/api/obelisk/v1/bootstrap',
          auth: 'nip98',
        },
      },
    }));

    const cap = await discoverIndexedBootstrap('wss://relay.example.com', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://relay.example.com/',
      expect.objectContaining({ headers: { Accept: 'application/nostr+json' } }),
    );
    expect(cap).toEqual({
      relay: 'wss://relay.example.com',
      bootstrapUrl: 'https://relay.example.com/api/obelisk/v1/bootstrap',
    });
  });

  it('returns null for unsupported capabilities', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      obelisk: {
        indexed_bootstrap: {
          version: 2,
          url: '/api/obelisk/v2/bootstrap',
          auth: 'nip98',
        },
      },
    }));

    await expect(discoverIndexedBootstrap('wss://relay.example.com', fetchImpl)).resolves.toBeNull();
  });

  it('signs the exact bootstrap URL including limit_per_group', async () => {
    const event = rawEvent({ kind: 9, tags: [['h', 'general']] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        obelisk: {
          indexed_bootstrap: {
            version: 1,
            url: '/api/obelisk/v1/bootstrap',
            auth: 'nip98',
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        version: 1,
        relay: 'wss://relay.example.com',
        generated_at: 1780617600,
        cursor: { since: 1780617590 },
        scopes: [{ scope: 'default', groups: [{ id: 'general', events: [event], next_before: 111 }] }],
      }));
    const signEvent = vi.fn().mockImplementation(async (template) => rawEvent({
      kind: template.kind,
      tags: template.tags,
      content: template.content,
      created_at: template.created_at,
    }));

    const result = await fetchIndexedBootstrap({
      relay: 'wss://relay.example.com',
      limitPerGroup: 50,
      signEvent,
      fetchImpl,
    });

    expect(result?.payload.cursorSince).toBe(1780617590);
    expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 27235,
      content: '',
      tags: [
        ['u', 'https://relay.example.com/api/obelisk/v1/bootstrap?limit_per_group=50'],
        ['method', 'GET'],
      ],
    }));
    expect(fetchImpl.mock.calls[1][0]).toBe('https://relay.example.com/api/obelisk/v1/bootstrap?limit_per_group=50');
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toMatch(/^Nostr /);
  });

  it('validates raw event shape in bootstrap payloads', () => {
    const valid = parseIndexedBootstrapPayload({
      version: 1,
      relay: 'wss://relay.example.com',
      generated_at: 1,
      cursor: { since: 1 },
      scopes: [{ scope: 'default', groups: [{ id: 'g', events: [rawEvent()], next_before: 1 }] }],
    });
    const invalid = parseIndexedBootstrapPayload({
      version: 1,
      relay: 'wss://relay.example.com',
      generated_at: 1,
      scopes: [{ scope: 'default', groups: [{ id: 'g', events: [{ kind: 9 }], next_before: 1 }] }],
    });

    expect(valid).not.toBeNull();
    expect(invalid).toBeNull();
  });

  it('derives the group message page URL from the advertised bootstrap URL', () => {
    const url = buildGroupMessagesUrl(
      {
        relay: 'wss://relay.example.com',
        bootstrapUrl: 'https://relay.example.com/api/obelisk/v1/bootstrap',
      },
      'general',
      { before: 123, limit: 50, scope: 'team-a' },
    );

    expect(url).toBe('https://relay.example.com/api/obelisk/v1/groups/general/messages?scope=team-a&before=123&limit=50');
  });
});
