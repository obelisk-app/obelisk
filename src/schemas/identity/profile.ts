/** Kind 0 is a complete replacement record; omitted or invalid fields stay absent. */
export function parseProfileContent(content: string): Record<string, string> | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return null;
  }
}
