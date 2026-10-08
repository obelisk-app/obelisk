'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import { MentionText } from '@/components/chat/mentions/MentionText';

/** One card in the bell popover: unread dot, kind and time, and the start of the message. */
export function InboxRow({ read, label, time, preview, onClick, testId }: {
  read: boolean;
  label: string;
  time?: string;
  preview: string | null | undefined;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <li>
      <Button
        variant="bare"
        onClick={onClick}
        data-testid={testId}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-lc-card/60 transition-colors ${read ? '' : 'bg-lc-olive/30'}`}
      >
        <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${read ? 'bg-transparent' : 'bg-lc-green'}`} />
        <div className="flex-1 min-w-0">
          <Text as="div" variant="label" size="xs" tone="muted" className="font-mono mb-0.5">
            {label}
            {time && <span className="ml-2 text-lc-muted/70 normal-case tracking-normal">{time}</span>}
          </Text>
          {preview && (
            <Text as="div" size="sm" tone="default" className="truncate"><MentionText content={preview} /></Text>
          )}
        </div>
      </Button>
    </li>
  );
}
