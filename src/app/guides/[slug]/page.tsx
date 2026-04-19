import type { Metadata } from 'next';
import GuideArticlePage, {
  buildGuideArticleMetadata,
} from '@/components/guides/GuideArticlePage';
import { listSlugs } from '@/lib/guides';

export async function generateStaticParams() {
  const slugs = await listSlugs('en');
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildGuideArticleMetadata('en', slug);
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GuideArticlePage locale="en" slug={slug} />;
}
