/**
 * True when `value` parses as an absolute `http:` or `https:` URL.
 *
 * The sticker and voice-note tag codecs each kept a private copy of this,
 * and the media library's pack editor a third under another name
 * (`validHttpUrl`); this is the one they share.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
