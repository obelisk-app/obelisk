'use client';

import { useId } from 'react';
import Input from '@/components/ui/forms/Input';

/** A labelled URL box under the profile header; blank and hinted while a file is staged instead. */
export default function ProfileUrlField({
  label,
  value,
  onChange,
  disabled,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: string;
  testId: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">{label}</label>
      <Input
        id={id}
        value={disabled ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hint ?? 'https://…'}
        className="transition-colors"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
      />
    </div>
  );
}
