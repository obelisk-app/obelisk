/** A media-kit section: its anchor, heading and optional line of description above the content. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-lc-white tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm sm:text-base text-lc-muted max-w-3xl">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
