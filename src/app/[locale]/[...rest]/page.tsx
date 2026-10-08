import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Any unknown path under a locale renders that locale's not-found page. */
export default function CatchAll() {
  notFound();
}
