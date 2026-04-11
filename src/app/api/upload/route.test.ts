// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Route saves under `${process.cwd()}/public/uploads` — redirect cwd to a tmp dir.
const TMP_CWD = mkdtempSync(path.join(tmpdir(), 'obelisk-upload-'));
const realCwd = process.cwd;
process.cwd = () => TMP_CWD;

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

import { POST } from './route';
import { getAuthPubkey } from '@/lib/api-auth';

const mockAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(formData: FormData) {
  // NextRequest's init drops body for multipart; wrap a native Request instead
  // so the multipart boundary / content-type are preserved.
  const base = new Request('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData,
  });
  return new NextRequest(base);
}

afterAll(() => {
  process.cwd = realCwd;
  rmSync(TMP_CWD, { recursive: true, force: true });
});

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const fd = new FormData();
    fd.append('file', new File(['hello'], 'hi.txt', { type: 'text/plain' }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
  });

  it('returns 400 when file field is missing', async () => {
    mockAuth.mockResolvedValue('pub1');
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
  });

  it('rejects unsupported mime types', async () => {
    mockAuth.mockResolvedValue('pub1');
    const fd = new FormData();
    fd.append(
      'file',
      new File(['<html></html>'], 'evil.html', { type: 'text/html' }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(415);
  });

  it('rejects empty files', async () => {
    mockAuth.mockResolvedValue('pub1');
    const fd = new FormData();
    fd.append('file', new File([], 'empty.png', { type: 'image/png' }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
  });

  it('accepts image and stores it under public/uploads', async () => {
    mockAuth.mockResolvedValue('pub1');
    const fd = new FormData();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
    fd.append('file', new File([bytes], 'pixel.png', { type: 'image/png' }));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.isImage).toBe(true);
    expect(body.name).toBe('pixel.png');
    expect(body.url).toMatch(/^http:\/\/localhost:3000\/uploads\/[a-f0-9]+\.png$/);

    const uploadDir = path.join(TMP_CWD, 'public', 'uploads');
    expect(existsSync(uploadDir)).toBe(true);
    expect(readdirSync(uploadDir).some((f) => f.endsWith('.png'))).toBe(true);
  });

  it('accepts pdf document', async () => {
    mockAuth.mockResolvedValue('pub1');
    const fd = new FormData();
    fd.append(
      'file',
      new File(['%PDF-1.4 content'], 'notes.pdf', { type: 'application/pdf' }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isImage).toBe(false);
    expect(body.url.endsWith('.pdf')).toBe(true);
  });
});
