import { liveCardResponse } from '@/services/server/og/live-card';

export const runtime = 'nodejs';

type Params = { params: Promise<{ locale: string; kind: string; id: string }> };

/**
 * The one route that draws a preview card on request, for the pages whose
 * card depends on live data: `/og/note/<id>`, `/og/profile/<id>`,
 * `/og/tag/<tag>`, `/og/relay/<code>` (and `/es/...`, `/pt/...`). Every
 * other page's card is a file under `public/og/cards/` (`npm run snap-og`).
 * The page names its card with `ogImage` (`src/utils/seo/og.ts`).
 */
export async function GET(_request: Request, { params }: Params) {
  const { locale, kind, id } = await params;
  return liveCardResponse(locale, kind, id);
}
