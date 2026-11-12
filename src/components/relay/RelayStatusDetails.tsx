import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import { useTranslations } from 'next-intl';
import AnchoredMenu from '@/components/common/AnchoredMenu';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import SheetActions from '@/components/ui/overlays/SheetActions';

type Props = {
  mobile: boolean;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

export default function RelayStatusDetails({ mobile, open, onClose, anchorRef, children }: Props) {
  const t = useTranslations();
  if (mobile) return open ? createPortal(<div className="obelisk-mobile fixed inset-0 z-[160]"><Sheet screen="relay-status" label={t('social.relays')} onClose={onClose} testId="relay-status-popover">
    <SheetHeader title={t('social.relays')} />
    {children}
    <SheetActions onCancel={onClose} dismiss="close" />
  </Sheet></div>, document.body) : null;
  return <AnchoredMenu open={open} onClose={onClose} anchorRef={anchorRef} width={272} testId="relay-status-popover">{children}</AnchoredMenu>;
}
