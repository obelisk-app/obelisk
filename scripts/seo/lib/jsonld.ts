/**
 * A structural validator for the JSON-LD this site emits.
 *
 * Google's Rich Results Test cannot be called from a script, so this checks
 * what it checks for the types we use: the schema.org type exists, the
 * properties Google requires for that type are present and well formed
 * (absolute URLs, ISO 8601 dates, positions in order), and nothing is an
 * empty or placeholder value. `notes` are not failures: they say where a
 * type is valid schema.org but not eligible for a rich result (an app with
 * no ratings, an FAQ on a site that is not a government or health site).
 */

export type JsonLdReport = { errors: string[]; notes: string[]; types: string[]; nodes: Node[] };
type Node = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const URL_KEYS = new Set(['url', '@id', 'item', 'contentUrl', 'logo', 'image', 'thumbnailUrl', 'sameAs', 'mainEntityOfPage']);

/** The types we emit, each with the properties Google (or schema.org) requires of it. */
const REQUIRED: Record<string, string[]> = {
  WebSite: ['name', 'url'],
  Organization: ['name', 'url', 'logo'],
  WebApplication: ['name', 'url', 'applicationCategory', 'operatingSystem', 'offers'],
  SoftwareApplication: ['name', 'url', 'applicationCategory', 'operatingSystem', 'offers'],
  Offer: ['price', 'priceCurrency'],
  FAQPage: ['mainEntity'],
  Question: ['name', 'acceptedAnswer'],
  Answer: ['text'],
  Article: ['headline', 'image', 'datePublished', 'dateModified', 'author'],
  TechArticle: ['headline', 'image', 'datePublished', 'dateModified', 'author'],
  BreadcrumbList: ['itemListElement'],
  ItemList: ['itemListElement'],
  ListItem: ['position'],
  ImageObject: [],
  ImageGallery: ['name', 'url'],
  CollectionPage: ['name', 'url'],
  WebPage: [],
  Person: ['name'],
};

export function validateJsonLd(block: unknown): JsonLdReport {
  const report: JsonLdReport = { errors: [], notes: [], types: [], nodes: [] };
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    report.errors.push('JSON-LD block is not an object');
    return report;
  }
  const root = block as Node;
  if (root['@context'] !== 'https://schema.org') report.errors.push(`@context is ${JSON.stringify(root['@context'])}, expected "https://schema.org"`);
  const tops = Array.isArray(root['@graph']) ? (root['@graph'] as Node[]) : [root];
  for (const node of tops) walk(node, '$', report, true);
  return report;
}

function walk(node: unknown, at: string, report: JsonLdReport, top: boolean): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${at}[${i}]`, report, top));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Node;
  const type = n['@type'];
  if (typeof type === 'string') {
    report.nodes.push(n);
    if (top) report.types.push(type);
    checkNode(n, type, `${at}<${type}>`, report);
  } else if (top) {
    report.errors.push(`${at}: top-level node has no @type`);
  }
  for (const [key, value] of Object.entries(n)) {
    if (key === '@context' || key === '@type') continue;
    checkValue(key, value, `${at}.${key}`, report);
    if (value && typeof value === 'object') walk(value, `${at}.${key}`, report, false);
  }
}

function checkValue(key: string, value: unknown, at: string, report: JsonLdReport): void {
  if (typeof value === 'string') {
    if (!value.trim() || /^(undefined|null|NaN)$/.test(value) || /\$undefined/.test(value)) report.errors.push(`${at}: empty or placeholder value ${JSON.stringify(value)}`);
    if (URL_KEYS.has(key) && !isAbsoluteUrl(value) && !(key === '@id' && value.startsWith('#'))) report.errors.push(`${at}: not an absolute URL: ${value}`);
    if (/^date|Date$/.test(key) && !ISO_DATE.test(value)) report.errors.push(`${at}: not an ISO 8601 date: ${value}`);
  }
}

function checkNode(n: Node, type: string, at: string, report: JsonLdReport): void {
  const required = REQUIRED[type];
  if (!required) {
    report.errors.push(`${at}: type is not one this validator knows; add its rules before emitting it`);
    return;
  }
  for (const prop of required) {
    const v = n[prop];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) report.errors.push(`${at}: missing required "${prop}"`);
  }
  const rule = RULES[type];
  if (rule) rule(n, at, report);
}

const RULES: Record<string, (n: Node, at: string, r: JsonLdReport) => void> = {
  Article: articleRule,
  TechArticle: articleRule,
  WebApplication: appRule,
  SoftwareApplication: appRule,
  BreadcrumbList: (n, at, r) => listRule(n, at, r, true),
  ItemList: (n, at, r) => listRule(n, at, r, false),
  FAQPage: (n, at, r) => {
    const items = asArray(n.mainEntity);
    items.forEach((q, i) => {
      if ((q as Node)?.['@type'] !== 'Question') r.errors.push(`${at}.mainEntity[${i}]: expected a Question`);
      if (((q as Node)?.acceptedAnswer as Node)?.['@type'] !== 'Answer') r.errors.push(`${at}.mainEntity[${i}]: acceptedAnswer must be an Answer`);
    });
    r.notes.push(`${at}: FAQ rich results are shown only for government and health sites; the markup stays valid`);
  },
  ImageObject: (n, at, r) => {
    if (!n.url && !n.contentUrl) r.errors.push(`${at}: needs url or contentUrl`);
  },
  Offer: (n, at, r) => {
    if (typeof n.price !== 'string' && typeof n.price !== 'number') r.errors.push(`${at}: price must be a number or numeric string`);
    if (typeof n.priceCurrency === 'string' && !/^[A-Z]{3}$/.test(n.priceCurrency)) r.errors.push(`${at}: priceCurrency must be ISO 4217`);
  },
};

function articleRule(n: Node, at: string, r: JsonLdReport): void {
  if (typeof n.headline === 'string' && n.headline.length > 110) r.errors.push(`${at}: headline is ${n.headline.length} characters (Google truncates past 110)`);
  if (typeof n.datePublished === 'string' && typeof n.dateModified === 'string' && n.dateModified < n.datePublished) r.errors.push(`${at}: dateModified is before datePublished`);
  for (const a of asArray(n.author)) {
    const author = a as Node;
    if (!author?.name) r.errors.push(`${at}.author: needs a name`);
    if (!author?.url) r.errors.push(`${at}.author: needs a url (Google's author best practice)`);
  }
  if (!n.inLanguage) r.errors.push(`${at}: missing inLanguage`);
}

function appRule(n: Node, at: string, r: JsonLdReport): void {
  if (!n.aggregateRating && !n.review) r.notes.push(`${at}: no aggregateRating or review, so not eligible for the software app rich result (valid markup; ratings are never invented)`);
}

function listRule(n: Node, at: string, r: JsonLdReport, breadcrumb: boolean): void {
  const items = asArray(n.itemListElement) as Node[];
  items.forEach((item, i) => {
    if (item?.['@type'] !== 'ListItem') r.errors.push(`${at}.itemListElement[${i}]: expected a ListItem`);
    if (item?.position !== i + 1) r.errors.push(`${at}.itemListElement[${i}]: position should be ${i + 1}, is ${JSON.stringify(item?.position)}`);
    const last = i === items.length - 1;
    if (breadcrumb && !item?.name) r.errors.push(`${at}.itemListElement[${i}]: breadcrumb needs a name`);
    if (breadcrumb && !last && !item?.item) r.errors.push(`${at}.itemListElement[${i}]: breadcrumb needs an item URL`);
    if (!breadcrumb && !item?.url && !item?.item) r.errors.push(`${at}.itemListElement[${i}]: needs url or item`);
  });
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function isAbsoluteUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Every string under a JSON-LD value whose key is reader-facing text. */
export function textValues(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => textValues(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && ['name', 'description', 'headline', 'text', 'caption', 'alternativeHeadline'].includes(k)) out.push(v);
      else textValues(v, out);
    }
  }
  return out;
}
