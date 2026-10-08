/** The same values with every text field trimmed: what most forms publish. */
export function trimmedValues<V extends Record<string, unknown>>(values: V): V {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) out[key] = typeof value === 'string' ? value.trim() : value;
  return out as V;
}

/** The same fields holding the same values (`Object.is` per field): a form that adopts these need not re-render. */
export function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}
