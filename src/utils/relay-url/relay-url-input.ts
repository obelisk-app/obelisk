/**
 * What a typed relay address becomes before it is added.
 *
 * `relay.example` and `//relay.example` both mean `wss://relay.example`;
 * an explicit `ws://` or `wss://` is kept as typed. Returns `null` when the
 * result is not a URL at all, so the form can show "Invalid URL" instead of
 * handing garbage to the bridge.
 *
 * Both relay-add forms (desktop rail modal and phone sheet) applied this
 * rule inline; it lives here so the two cannot drift.
 */
export function normalizeRelayInput(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!value.startsWith('ws://') && !value.startsWith('wss://')) {
    value = 'wss://' + value.replace(/^\/*/, '');
  }
  try {
    new URL(value);
  } catch {
    return null;
  }
  return value;
}
