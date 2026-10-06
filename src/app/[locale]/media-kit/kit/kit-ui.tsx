'use client';

import Button from '@/components/ui/Button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * The media kit's labelled copy pill. It keeps a text label, which the
 * icon-only `ui/CopyButton` cannot show, but shares that button's hook:
 * the shared 2000 ms (this pill used 1500), and a refused clipboard no
 * longer throws out of the click handler.
 */
export function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button variant="pillSecondary" size="xs" onClick={() => { void copy(text); }}>
      {copied ? 'Copied ✓' : 'Copy'}
    </Button>
  );
}

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

// Obelisk silhouette: same artwork as /og/obelisk.png so banners stay
// visually identical to the share preview.
export function ObeliskMark({
  width = '100%',
  height = '100%',
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      aria-hidden
    >
      <path
        d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z"
        fill="#a3a3a3"
        opacity={0.7}
      />
      <path
        d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z"
        fill="#fafafa"
      />
    </svg>
  );
}
