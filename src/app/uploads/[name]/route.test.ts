// @vitest-environment node
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Handler reads from `${process.cwd()}/uploads` — redirect cwd to a tmp dir.
const TMP_CWD = mkdtempSync(path.join(tmpdir(), 'obelisk-serve-'));
const realCwd = process.cwd;
process.cwd = () => TMP_CWD;

import { GET } from './route';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const STORED_NAME = 'abcdef0123456789.png';

beforeAll(() => {
  const dir = path.join(TMP_CWD, 'uploads');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, STORED_NAME), PNG_BYTES);
});

afterAll(() => {
  process.cwd = realCwd;
  rmSync(TMP_CWD, { recursive: true, force: true });
});

function makeRequest(name: string) {
  return new NextRequest(new Request(`http://localhost:3000/uploads/${name}`));
}

function withParams(name: string) {
  return { params: Promise.resolve({ name }) };
}

describe('GET /uploads/[name]', () => {
  it('serves an existing file with the correct content-type', async () => {
    const res = await GET(makeRequest(STORED_NAME), withParams(STORED_NAME));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Length')).toBe(String(PNG_BYTES.length));
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG_BYTES));
  });

  it('returns 404 for missing files', async () => {
    const name = 'deadbeef00000000.png';
    const res = await GET(makeRequest(name), withParams(name));
    expect(res.status).toBe(404);
  });

  it('rejects path traversal attempts', async () => {
    const name = '..%2Fetc%2Fpasswd';
    const res = await GET(makeRequest(name), withParams('../etc/passwd'));
    expect(res.status).toBe(404);
  });

  it('rejects names with unexpected characters', async () => {
    const name = 'not a hash.png';
    const res = await GET(makeRequest(encodeURIComponent(name)), withParams(name));
    expect(res.status).toBe(404);
  });

  it('falls back to octet-stream for unknown extensions', async () => {
    const weird = 'abcdef0123456789.xyz';
    mkdirSync(path.join(TMP_CWD, 'uploads'), { recursive: true });
    writeFileSync(path.join(TMP_CWD, 'uploads', weird), new Uint8Array([1, 2, 3]));
    const res = await GET(makeRequest(weird), withParams(weird));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });
});
