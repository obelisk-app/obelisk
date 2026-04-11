import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

function getUploadDir() {
  return path.join(process.cwd(), 'uploads');
}

// Stored filenames are `${randomHex}.${ext}` — hex comes from randomBytes(12)
// (24 chars) and ext comes from our own extensionFor() allowlist. Keep this
// regex strict so the handler can never resolve anything resembling a
// path-traversal attempt.
const SAFE_NAME = /^[a-f0-9]{1,64}\.[a-z0-9]{1,8}$/;

// Served Content-Type for the extensions we actually write. Anything else
// falls back to application/octet-stream, which is safe (browsers will offer
// to download rather than render).
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.weba': 'audio/webm',
  '.pdf': 'application/pdf',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!SAFE_NAME.test(name)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const uploadDir = getUploadDir();
  const filePath = path.join(uploadDir, name);

  // Defence in depth: ensure the resolved path is still inside uploadDir.
  const rel = path.relative(uploadDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let stats;
  try {
    stats = await stat(filePath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!stats.isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const bytes = await readFile(filePath);
  const ext = path.extname(name).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
      // Stored names contain 24 hex chars of entropy and are never reused,
      // so the response is effectively immutable.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
