/** Development-only login diagnostics. Never pass credentials or event bodies here. */
export function traceLogin(stage: string, detail: Record<string, string | number | boolean> = {}): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.info('[login-trace]', JSON.stringify({ time: new Date().toISOString(), stage, ...detail }));
}

/** Relay paths and queries may carry credentials; only the hostname is diagnostic. */
export function traceRelayHost(value: string): string {
  try { return new URL(value).hostname; } catch { return 'invalid-url'; }
}

/** Remote error text is untrusted and can echo secrets. Log a bounded category only. */
export function traceLoginFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  for (const category of ['timestamp', 'future', 'too old', 'creation date', 'restricted', 'auth-required', 'rate-limited', 'blocked', 'timeout', 'timed out', 'cancel', 'abort', 'closed', 'network', 'connect', 'secret', 'permission', 'decrypt', 'invalid']) {
    if (text.toLowerCase().includes(category)) return category;
  }
  return 'unclassified-error';
}
