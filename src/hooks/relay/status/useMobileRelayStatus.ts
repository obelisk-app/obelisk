import { useTranslations } from 'next-intl';
import { useMobileSigningIndicator } from '@/hooks/feedback/useMobileSigningIndicator';
import { activityDetail, activityTitle } from '@/utils/errors/activity-text';

export function useMobileRelayStatus() {
  const t = useTranslations();
  const vm = useMobileSigningIndicator();
  return {
    status: vm.status,
    dotClass: vm.dotClass,
    label: t('mobile.signing.label'),
    statusText: t(`mobile.signing.${vm.status}`),
    title: vm.signing ? activityTitle(t, vm.signing) : t('mobile.signing.none'),
    detail: vm.signing ? activityDetail(t, vm.signing) : undefined,
  };
}
