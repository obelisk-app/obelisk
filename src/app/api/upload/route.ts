import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthPubkey } from '@/lib/api-auth';
import {
  extensionFor,
  isAllowedMime,
  isImageMime,
  isVideoMime,
  maxBytesFor,
} from '@/lib/attachments';

export const runtime = 'nodejs';

function getUploadDir() {
  return path.join(process.cwd(), 'public', 'uploads');
}

// POST /api/upload — accepts a multipart form with field "file"
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
  if (!isAllowedMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || 'unknown'}` },
      { status: 415 },
    );
  }
  const cap = maxBytesFor(file.type);
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
  });
}
