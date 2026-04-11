import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthPubkey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import {
  extensionFor,
  isAllowedMime,
  isImageMime,
  isVideoMime,
  isAudioMime,
  maxBytesFor,
  maxBytesForWithLimits,
  parseServerLimits,
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
} from '@/lib/attachments';

export const runtime = 'nodejs';

function getUploadDir() {
  return path.join(process.cwd(), 'public', 'uploads');
}

// POST /api/upload — accepts a multipart form with field "file".
// Optional `?serverId=<id>` — when present, per-server upload limits override
// the global caps (still clamped to `SERVER_MAX_CEILING`). Without a serverId,
// or when the server is not found, the global defaults apply.
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }

  // Resolve per-server limits if a serverId was supplied, otherwise fall back
  // to the global defaults. The serverId is optional so standalone uploads
  // (e.g. onboarding / icon uploads) still work.
  let limits: UploadLimits = DEFAULT_UPLOAD_LIMITS;
  const serverId = req.nextUrl.searchParams.get('serverId');
  if (serverId) {
    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: {
          maxImageBytes: true,
          maxVideoBytes: true,
          maxDocBytes: true,
          maxAudioBytes: true,
          allowedMimeTypes: true,
        },
      });
      if (server) limits = parseServerLimits(server);
    } catch {
      // fall back to defaults on DB errors
    }
  }

  // Type allowlist: if the server has configured an override, it must both
  // be in the global allowlist AND appear in the override list. Otherwise the
  // global allowlist applies.
  if (!isAllowedMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || 'unknown'}` },
      { status: 415 },
    );
  }
  if (limits.allowedMimes && !limits.allowedMimes.has(file.type)) {
    return NextResponse.json(
      { error: `This server does not allow uploads of type ${file.type}` },
      { status: 415 },
    );
  }

  const cap = serverId && limits !== DEFAULT_UPLOAD_LIMITS
    ? maxBytesForWithLimits(file.type, limits)
    : maxBytesFor(file.type);
  if (file.size > cap) {
    const capMb = Math.round(cap / (1024 * 1024));
    return NextResponse.json(
      { error: `File exceeds ${capMb} MB limit for this type` },
      { status: 413 },
    );
  }

  const ext = extensionFor(file.type, file.name);
  const id = randomBytes(12).toString('hex');
  const storedName = `${id}.${ext}`;

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, storedName), bytes);

  const origin = req.nextUrl.origin;
  const url = `${origin}/uploads/${storedName}`;

  return NextResponse.json({
    url,
    name: file.name || storedName,
    size: file.size,
    type: file.type,
    isImage: isImageMime(file.type),
    isVideo: isVideoMime(file.type),
    isAudio: isAudioMime(file.type),
  });
}
