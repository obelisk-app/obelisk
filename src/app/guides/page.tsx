import GuidesIndexPage, { buildGuidesIndexMetadata } from '@/components/guides/GuidesIndexPage';

export const metadata = buildGuidesIndexMetadata('en');

export default function Page() {
  return <GuidesIndexPage locale="en" />;
}
