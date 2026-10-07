import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

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
        <Heading as="h2" variant="article" className="sm:text-3xl">
          {title}
        </Heading>
        {description && (
          <Text as="p" variant="muted" className="mt-2 sm:text-base max-w-3xl">
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}
