'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import type { AnalyticsChoice } from '@/services/analytics/consent';

/**
 * "Allow" and "Don't allow", side by side, the same size and the same
 * look: declining is exactly as easy as accepting. The current answer, if
 * any, is shown as pressed. Used by the banner and by Settings.
 */
export default function AnalyticsChoiceButtons({ choice, onChoose, testIdPrefix }: {
  choice: AnalyticsChoice | null;
  onChoose: (choice: AnalyticsChoice) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations();
  const options: ReadonlyArray<{ value: AnalyticsChoice; label: string }> = [
    { value: 'granted', label: t('common.analyticsConsent.allow') },
    { value: 'denied', label: t('common.analyticsConsent.decline') },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="outline"
          tone={choice === option.value ? 'accent' : 'default'}
          size="sm"
          className="w-full justify-center"
          aria-pressed={choice === null ? undefined : choice === option.value}
          onClick={() => onChoose(option.value)}
          data-testid={`${testIdPrefix}-${option.value}`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
