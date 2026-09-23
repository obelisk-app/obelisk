import GuidesIndexPage, { buildGuidesIndexMetadata } from '@/components/guides/GuidesIndexPage';

export const metadata = buildGuidesIndexMetadata('pt');

export default function Page() {
  return <GuidesIndexPage locale="pt" />;
}
