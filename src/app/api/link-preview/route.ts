import { NextRequest, NextResponse } from 'next/server';

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// In-memory cache
const cache = new Map<string, { data: OgData; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const inFlight = new Map<string, Promise<OgData>>();

// Block private/internal IPs (SSRF protection)
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname === '[::1]' ||
      hostname.endsWith('.local')
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function parseOgTags(html: string): OgData {
  const data: OgData = {};

  const getMetaContent = (property: string): string | undefined => {
    // Match both property="og:X" and name="og:X" patterns
    const regex = new RegExp(
      `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*?)["']|<meta[^>]*content=["']([^"']*?)["'][^>]*(?:property|name)=["']${property}["']`,
      'i'
    );
    const match = html.match(regex);
    return match?.[1] || match?.[2] || undefined;
  };

  data.title = getMetaContent('og:title') || (() => {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch?.[1]?.trim();
  })();
  data.description = getMetaContent('og:description') || getMetaContent('description');
  data.image = getMetaContent('og:image');
  data.siteName = getMetaContent('og:site_name');

  return data;
}

async function fetchOgData(url: string): Promise<OgData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Obelisk/1.0 (Link Preview Bot)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    if (!res.ok) return {};

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return {};

    // Only read first 50KB for OG tags
    const reader = res.body?.getReader();
    if (!reader) return {};

    let html = '';
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const MAX_BYTES = 50_000;

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
      // Early exit if we've passed </head>
      if (html.includes('</head>')) break;
    }
    reader.cancel();

    return parseOgTags(html);
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // SSRF protection
  if (isPrivateUrl(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Deduplicate in-flight requests
  let promise = inFlight.get(url);
  if (!promise) {
    promise = fetchOgData(url);
    inFlight.set(url, promise);
    promise.finally(() => inFlight.delete(url));
  }

  const data = await promise;
  cache.set(url, { data, fetchedAt: Date.now() });

  return NextResponse.json(data);
}
