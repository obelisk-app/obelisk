'use client';

import CopyButton from '@/components/ui/CopyButton';
import { useTranslation } from '@/i18n/context';

export default function CodeBlock({ code, language }: { code: string; language?: string }) {
  const { t } = useTranslation();
  const label = language || 'text';

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-lc-border" data-testid="code-block">
      <div className="flex items-center justify-between px-3 py-1.5 bg-lc-black/80 border-b border-lc-border text-xs text-lc-muted">
        <span>{label}</span>
        {/* Revealed on hover, and on keyboard focus so a tab stop is never invisible. */}
        <CopyButton
          text={code}
          label={t('common.copy').replace('{label}', label)}
          copiedLabel={t('common.copied')}
          className="opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100"
          data-testid="copy-code-btn"
        />
      </div>
      <pre className="bg-lc-black p-3 text-sm text-lc-white overflow-x-auto" data-testid="code-fallback">
        <code>{code}</code>
      </pre>
    </div>
  );
}
