import type { Metadata } from 'next';
import AppShell from './AppShell';

export const metadata: Metadata = {
  title: 'App',
  alternates: { canonical: '/app' },
};

export default function AppPage() {
  return <AppShell />;
}
