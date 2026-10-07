import type { ReactNode } from 'react';

/** One titled group of counters in the voice debug overlay. */
export default function DebugSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ color: '#fafafa', fontWeight: 500 }}>{title}</div>
      {children}
    </div>
  );
}
