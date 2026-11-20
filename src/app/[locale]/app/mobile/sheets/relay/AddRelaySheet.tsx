'use client';

import { useTranslations } from 'next-intl';
import ConcordAddCommunity from '@/app/[locale]/app/concord/ConcordAddCommunity';
import { CreateCommunityOption } from '@/components/relay/CreateCommunityOption';
import { JoinCommunityForm } from '@/components/relay/JoinCommunityForm';
import Heading from '@/components/ui/layout/Heading';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetActions from '@/components/ui/overlays/SheetActions';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import { useAddRelay } from '@/hooks/relay/rail/useAddRelay';
import { SUGGESTED_RELAYS } from '@/services/relay/relay-info';
import { PlusIcon } from '@/assets/icons';
import { SuggestedRelayItem } from './SuggestedRelayItem';

export function AddRelaySheet({ close }: { close: () => void }) {
  const t = useTranslations('shell.rail.addModal');
  const vm = useAddRelay();

  return (
    <Sheet onClose={close} screen="add-relay" label={t(vm.creating ? 'createCommunity' : 'title')} maxHeight="88%">
      <SheetHeader
        icon={<PlusIcon size={null} />}
        title={t(vm.creating ? 'createCommunity' : 'title')}
        subtitle={t(vm.creating ? 'createHelp' : 'joinHelp')}
        onBack={vm.creating ? vm.backToJoin : undefined}
      />
      <div className="max-h-[52dvh] space-y-5 overflow-y-auto">
        {vm.creating ? <ConcordAddCommunity onClose={close} /> : (
          <>
            <JoinCommunityForm onClose={close} />
            {SUGGESTED_RELAYS.length > 0 && (
              <section className="space-y-2">
                <Heading as="h2" variant="panel">{t('suggested')}</Heading>
                {SUGGESTED_RELAYS.map(({ url }) => (
                  <SuggestedRelayItem key={url} url={url} alreadyAdded={vm.isConfigured(url)} onAdded={close} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
      {!vm.creating && <CreateCommunityOption onOpen={vm.openCreate} />}
      <SheetActions onCancel={close} dismiss="close" />
    </Sheet>
  );
}
