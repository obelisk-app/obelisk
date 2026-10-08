import Card from '@/components/ui/layout/Card';
import { CopyButton } from './CopyButton';

/** A snippet to copy: the code in a card, with a copy pill in its corner. */
export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <Card variant="interactive" padding="lg" asChild>
        <pre className="overflow-x-auto text-xs sm:text-sm text-lc-white whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      </Card>
      <div className="absolute top-3 right-3">
        <CopyButton text={code} />
      </div>
    </div>
  );
}
