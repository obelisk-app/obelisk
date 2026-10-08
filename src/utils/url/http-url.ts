/** Parse an absolute HTTP(S) URL without imposing caller-specific host or credential rules. */
export function parseHttpUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Whether a value parses as an absolute HTTP(S) URL; its original spelling is unchanged. */
export function isHttpUrl(value: string): boolean {
  return parseHttpUrl(value) !== null;
}
