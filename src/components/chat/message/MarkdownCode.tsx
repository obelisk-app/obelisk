'use client';

import type { ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { markdownCode } from '@/utils/message-text/markdown';
import CodeBlock from './CodeBlock';

/** A markdown `code` element: a fenced block as a `CodeBlock`, inline code as a styled `<code>`. */
export function MarkdownCode({ className, children, ...props }: ComponentProps<'code'> & ExtraProps) {
  const code = markdownCode(className, children, Boolean(props.node?.position));
  if (code.block) return <CodeBlock code={code.code} language={code.language} />;
  return (
    <code className="bg-lc-dark text-lc-green px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...props}>
      {children}
    </code>
  );
}
