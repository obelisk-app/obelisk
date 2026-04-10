'use client';

import { useEffect, useState, useRef } from 'react';

let highlighterPromise: Promise<import('shiki').Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['vitesse-dark'],
        langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'json', 'bash', 'html', 'css', 'sql', 'yaml', 'markdown', 'jsx', 'tsx'],
      })
    );
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const lang = language && highlighter.getLoadedLanguages().includes(language) ? language : 'text';
        const result = highlighter.codeToHtml(code, {
          lang,
          theme: 'vitesse-dark',
        });
        setHtml(result);
      })
      .catch(() => {/* fallback to plain */});
    return () => { cancelled = true; };
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-lc-border" data-testid="code-block">
      {/* Language label + copy */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-lc-black/80 border-b border-lc-border text-xs text-lc-muted">
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover/code:opacity-100 transition-opacity text-lc-muted hover:text-lc-green"
          data-testid="copy-code-btn"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto text-sm [&_pre]:!bg-lc-black [&_pre]:!p-3 [&_pre]:!m-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="bg-lc-black p-3 text-sm text-lc-white overflow-x-auto" data-testid="code-fallback">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
