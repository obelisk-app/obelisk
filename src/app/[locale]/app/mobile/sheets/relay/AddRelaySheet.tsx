'use client';

import Button from '@/components/ui/buttons/Button';
import { SUGGESTED_RELAYS } from '@/services/relay/relay-info';
import { useTranslations } from 'next-intl';
import { useAddRelay } from '@/hooks/relay/rail/useAddRelay';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';
import { SuggestedRelayItem } from './SuggestedRelayItem';
import { CustomRelayForm } from '@/components/relay/CustomRelayForm';
import { PlusIcon } from '@/assets/icons';

export function AddRelaySheet({ close }: { close: () => void }) {
  const t = useTranslations();
  const { tab, setTab, isConfigured } = useAddRelay();

  return (
    <Sheet onClose={close} screen="add-relay" label={t('mobile.rail.addTitle')} maxHeight="88%">
      <SheetHeader
        icon={<PlusIcon size={null} />}
        title={t('mobile.rail.addTitle')}
      />
      <div className="dms-tabs native-scroll-x" style={{ padding: 0 }}>
        <Button variant="bare" className={`filter-tab ${tab === 'suggested' ? 'active' : ''}`} onClick={() => setTab('suggested')}>
          {t('shell.rail.addModal.suggested')}
        </Button>
        <Button variant="bare" className={`filter-tab ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>
          {t('shell.rail.addModal.custom')}
        </Button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '54vh', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
        {tab === 'suggested' ? (
          SUGGESTED_RELAYS.map((r) => (
            <SuggestedRelayItem
              key={r.url}
              url={r.url}
              alreadyAdded={isConfigured(r.url)}
              onAdded={close}
            />
          ))
        ) : (
          <CustomRelayForm presentation="sheet" onAdded={close} />
        )}
      </div>
      <SheetActions onCancel={close} dismiss="close" />
    </Sheet>
  );
}
