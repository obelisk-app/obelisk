import type { Metadata } from 'next';
import GuideArticlePage, {
  buildGuideArticleMetadata,
} from '@/components/guides/GuideArticlePage';
import { listSlugs } from '@/lib/guides';

export async function generateStaticParams() {
  // `listSlugs` unions this locale's articles with the English set, so an
  // untranslated article is still routable — it renders the original
  // rather than 404ing.
  const slugs = await listSlugs('pt');
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildGuideArticleMetadata('pt', slug);
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GuideArticlePage locale="pt" slug={slug} />;
}
