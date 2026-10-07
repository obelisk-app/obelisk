'use client';

import Input from '@/components/ui/forms/Input';

/** The search field both pickers share: an icon and a bare input in one bordered pill. */
export function MediaPickerSearch({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-lc-border bg-lc-black px-3 text-lc-muted transition-colors focus-within:border-lc-green">
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <Input
        variant="bare"
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted"
      />
    </label>
  );
}
