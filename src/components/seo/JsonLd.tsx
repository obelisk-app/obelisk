/**
 * One JSON-LD block. `<` is escaped so a string in the data (a guide title,
 * an FAQ answer) can never close the script element early.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
