import { buildZapRequest, fetchLnurlPayMetadata } from '@nostr-wot/wallet';
import type { requestZapInvoice as sdkRequestZapInvoice } from '@nostr-wot/wallet';
import { translate } from '@/i18n/runtime';

/** Invoice acquisition only: payment and its double-pay guards stay with sendZap. */
export async function requestZapInvoice(...[signer, options]: Parameters<typeof sdkRequestZapInvoice>): ReturnType<typeof sdkRequestZapInvoice> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadata = await fetchLnurlPayMetadata(options.lud16, fetchImpl);
  if (!metadata) throw new Error(translate('chat.zap.resolveFailed'));
  if (metadata.allowsNostr !== true) throw new Error(translate('chat.zap.unsupported'));
  const { minSendable: min, maxSendable: max } = metadata;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw new Error(translate('chat.zap.invalidMetadata'));
  }
  if (options.amountMsats < min || options.amountMsats > max) {
    throw new Error(translate('chat.zap.amountRange', { min: String(min / 1000), max: String(max / 1000) }));
  }
  let callback: URL;
  try { callback = new URL(metadata.callback); }
  catch { throw new Error(translate('chat.zap.invalidMetadata')); }
  if (callback.protocol !== 'https:' && callback.protocol !== 'http:') throw new Error(translate('chat.zap.invalidMetadata'));
  const { event } = await buildZapRequest(signer, options);
  callback.searchParams.set('amount', String(options.amountMsats));
  callback.searchParams.set('nostr', JSON.stringify(event));
  callback.searchParams.delete('comment');
  const allowed = (metadata as typeof metadata & { commentAllowed?: unknown }).commentAllowed;
  if (options.comment && typeof allowed === 'number' && Number.isSafeInteger(allowed) && allowed > 0) {
    callback.searchParams.set('comment', Array.from(options.comment).slice(0, allowed).join(''));
  }
  const response = await fetchImpl(callback.toString());
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!response.ok || data?.status === 'ERROR') {
    throw new Error(typeof data?.reason === 'string' && data.reason.trim()
      ? data.reason : translate('chat.zap.callbackFailed', { status: String(response.status) }));
  }
  if (typeof data?.pr !== 'string' || !data.pr.trim()) throw new Error(translate('chat.zap.noInvoice'));
  return { invoice: data.pr, zapRequest: event };
}
