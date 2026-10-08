'use client';

import Text from '@/components/ui/layout/Text';
import Card from '@/components/ui/layout/Card';
import Stack from '@/components/ui/layout/Stack';
import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { CloseIcon } from '@/assets/icons';
import { useToastStack } from '@/hooks/feedback/useToastStack';

/** One persistent live region for feedback on every screen. */
export default function ToastStack() {
  const t = useTranslations();
  const vm = useToastStack();

  return (
    <Stack
      gap="2" className="pointer-events-none fixed top-4 right-4 z-[60] max-w-sm w-[calc(100vw-2rem)] sm:w-96"
      role="status" aria-live="polite" aria-relevant="additions"
      data-testid="toast-stack"
    >
      {vm.toasts.map((toast) => (
        <Card variant="interactive" padding="none" key={toast.id} className="pointer-events-auto shadow-lg">
          <Row gap="0" align="start">
            <Button
              variant="bare"
              onClick={() => vm.open(toast)}
              className="min-w-0 flex-1 text-left px-4 py-3"
              data-testid="toast"
            >
              <Text as="div" size="sm" weight="semibold" tone="default" truncate="truncate">{toast.title}</Text>
              {toast.body && <div className="text-sm text-lc-muted mt-0.5 line-clamp-2 break-words">{toast.body}</div>}
            </Button>
            <Button
              variant="bare"
              aria-label={t('common.dismiss')}
              onClick={(e) => vm.dismiss(e, toast.id)}
              className="text-lc-muted hover:text-lc-white shrink-0 p-3"
              data-testid="toast-dismiss"
            >
              <CloseIcon size={16} />
            </Button>
          </Row>
        </Card>
      ))}
    </Stack>
  );
}
