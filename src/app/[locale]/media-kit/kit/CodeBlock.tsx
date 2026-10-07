import { CopyButton } from './CopyButton';

/** A snippet to copy: the code in a card, with a copy pill in its corner. */
export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="lc-card overflow-x-auto p-4 text-xs sm:text-sm text-lc-white whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <div className="absolute top-3 right-3">
        <CopyButton text={code} />
      </div>
    </div>
  );
}
