import type { BlobPointer } from '@applesauce/concord';
import { readConcordAttachment } from './media';

/** Only authenticated raster bytes enter an object URL. Never persist decrypted images. */
export async function openConcordImage(pointer: BlobPointer) {
  const bytes = await readConcordAttachment({ url: pointer.url, originalSha256: pointer.hash,
    encryption: { algorithm: 'aes-gcm', key: pointer.key, nonce: pointer.nonce } });
  const prefix = new TextDecoder().decode(bytes.slice(0, 12));
  const type = bytes[0] === 137 && prefix.slice(1, 4) === 'PNG' ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg'
    : prefix.startsWith('GIF8') ? 'image/gif'
    : prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP' ? 'image/webp' : null;
  if (!type) throw new Error('Unsupported community image');
  return URL.createObjectURL(new Blob([bytes], { type }));
}
