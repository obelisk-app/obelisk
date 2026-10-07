/** One screenshot: `scripts/snap-game-shots.mjs` captures each `data-shot` element. */
export default function Frame({ name, width, children }: { name: string; width: number; children: React.ReactNode }) {
  return (
    <section className="p-6">
      <div
        data-shot={name}
        className="rounded-xl border border-lc-border bg-lc-dark p-4"
        style={{ width }}
      >
        {children}
      </div>
    </section>
  );
}
