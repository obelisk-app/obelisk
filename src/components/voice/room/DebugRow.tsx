/** One counter in the voice debug overlay, red when it should be zero and is not. */
export default function DebugRow({ k, v, highlight }: { k: string; v: number | string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: highlight ? '#ef4444' : '#a3a3a3' }}>
      <span>{k}</span>
      <span>{String(v)}</span>
    </div>
  );
}
