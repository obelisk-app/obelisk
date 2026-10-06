/**
 * Search crawlers and link-preview fetchers. They must read the URL they
 * asked for: a language redirect would send WhatsApp in Brazil, or a
 * crawler sending `Accept-Language: es`, away from the page whose card or
 * index entry it is building. Each language already has its own URL, and
 * hreflang tells search engines which is which.
 */
const CRAWLER = /bot\b|crawler|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|linkedinbot|twitterbot|slackbot|telegrambot|discordbot|embedly|skypeuripreview|vkshare|pinterest|redditbot|applebot|bingpreview|yandex|baiduspider|duckduckbot|google-inspectiontool|googleother|lighthouse/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && CRAWLER.test(userAgent));
}
