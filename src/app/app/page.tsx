import type { Metadata } from 'next';
import AppGate from './AppGate';

export const metadata: Metadata = {
  title: 'App',
  alternates: { canonical: '/app' },
};

export default function AppPage() {
  return <AppGate />;
}
