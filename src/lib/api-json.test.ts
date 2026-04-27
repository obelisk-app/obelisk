import { describe, it, expect } from 'vitest';
import { parseJsonBody, extractApiError } from './api-json';

function makeReq(bodyInit: BodyInit | null): Request {
  return new Request('http://test.local/x', {
    method: 'POST',
    body: bodyInit,
    headers: { 'content-type': 'application/json' },
  });
}

function makeRes(body: BodyInit | null, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

describe('parseJsonBody', () => {
  it('returns the parsed body when JSON is valid', async () => {
    const req = makeReq(JSON.stringify({ a: 1, b: 'two' }));
    const body = await parseJsonBody<{ a: number; b: string }>(req);
    expect(body).toEqual({ a: 1, b: 'two' });
  });

  it('returns an empty object when the body is not valid JSON', async () => {
    const req = makeReq('<<not json>>');
    const body = await parseJsonBody(req);
    expect(body).toEqual({});
  });

  it('returns an empty object when the body is empty', async () => {
    const req = makeReq(null);
    const body = await parseJsonBody(req);
    expect(body).toEqual({});
  });
});

describe('extractApiError', () => {
  it('uses the body `error` field when present', async () => {
    const res = makeRes(JSON.stringify({ error: 'Permission denied' }), 403);
    expect(await extractApiError(res, 'Save')).toBe('Permission denied');
  });

  it('falls back to a generic message when there is no `error` field', async () => {
    const res = makeRes(JSON.stringify({}), 500);
    expect(await extractApiError(res, 'Save')).toBe('Save failed (HTTP 500)');
  });

  it('falls back when the body is not JSON at all', async () => {
    const res = makeRes('<html>Bad Gateway</html>', 502);
    expect(await extractApiError(res, 'Refresh')).toBe('Refresh failed (HTTP 502)');
  });
});
