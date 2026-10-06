/**
 * Reading and expiring cookies from the page. Shared by the local-data
 * removals (`local-data/browser-stores.ts`) and the analytics consent
 * (`analytics/gtag.ts`), which must not pull the whole inventory into
 * every page just to delete two cookies.
 */

/** The names of the cookies this page can see. */
export function cookieNamesOn(doc: Document): string[] {
  try {
    return doc.cookie.split(';').map((part) => part.trim().split('=')[0]).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Every domain a cookie for `hostname` may have been set on: Google
 * Analytics writes its cookies on the registrable domain (`.obelisk.ar`),
 * and a cookie only expires when the domain attribute matches.
 */
function cookieDomains(hostname: string): string[] {
  const labels = hostname.split('.');
  const out: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'));
  return out;
}

/** Expire one cookie, on the host and on each parent domain. */
export function expireCookie(name: string, doc: Document): void {
  const host = doc.location?.hostname ?? '';
  try {
    doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (const domain of cookieDomains(host)) doc.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
  } catch { /* cookies disabled */ }
}
