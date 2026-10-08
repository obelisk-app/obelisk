'use client';

import Text from '@/components/ui/layout/Text';

import Card from '@/components/ui/layout/Card';
import Stack from '@/components/ui/layout/Stack';
import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { CloseIcon } from '@/assets/icons';
import { useToastStack } from '@/hooks/feedback/useToastStack';

/** The toasts at the top right; each closes on its own after five seconds. */
export default function ToastStack() {
  const t = useTranslations();
  const vm = useToastStack();

  if (vm.toasts.length === 0) return null;

  return (
    <Stack
      gap="2" className="fixed top-4 right-4 z-[60] max-w-sm w-[calc(100vw-2rem)] sm:w-96"
      data-testid="toast-stack"
    >
      {vm.toasts.map((toast) => (
        <Card variant="interactive" padding="none" key={toast.id} asChild>
          <Button
            variant="bare"
            type="button"
            onClick={() => vm.open(toast)}
            className="text-left px-4 py-3 shadow-lg border border-lc-border hover:border-lc-green/50 transition-colors cursor-pointer group"
            data-testid="toast"
          >
            <Row gap="3" align="start">
              <div className="flex-1 min-w-0">
                <Text as="div" size="sm" weight="semibold" tone="default" truncate="truncate">{toast.title}</Text>
                <div className="text-sm text-lc-muted mt-0.5 line-clamp-2 break-words">{toast.body}</div>
              </div>
              <span
                role="button"
                aria-label={t('common.dismiss')}
                tabIndex={-1}
                onClick={(e) => vm.dismiss(e, toast.id)}
                className="text-lc-muted hover:text-lc-white shrink-0"
                data-testid="toast-dismiss"
              >
                <CloseIcon size={16} />
              </span>
            </Row>
          </Button>
        </Card>
      ))}
    </Stack>
  );
}
