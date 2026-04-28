import GuidesIndexPage, { buildGuidesIndexMetadata } from '@/components/guides/GuidesIndexPage';

export const metadata = buildGuidesIndexMetadata('es');

export default function Page() {
  return <GuidesIndexPage locale="es" />;
}
