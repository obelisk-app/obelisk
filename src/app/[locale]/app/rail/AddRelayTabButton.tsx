'use client';

import Button from '@/components/ui/buttons/Button';

/** One tab of the add-relay dialog, underlined in green while active. */
export function AddRelayTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="bare"
      onClick={onClick}
      className={
        'relative -mb-px flex-1 px-4 py-3 text-sm font-semibold transition-colors ' +
        (active ? 'text-lc-white' : 'text-lc-muted hover:text-lc-white')
      }
    >
      {children}
      <span
        className={
          'absolute bottom-0 left-0 right-0 h-0.5 rounded-full transition-opacity ' +
          (active ? 'bg-lc-green opacity-100' : 'opacity-0')
        }
      />
    </Button>
  );
}
