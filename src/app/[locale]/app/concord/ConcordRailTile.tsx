'use client';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordRailTile } from '@/hooks/chat/concord/useConcordRailTile';
import { useTranslations } from 'next-intl';
import AnchoredMenu from '@/components/common/AnchoredMenu';
import { MENU_PANEL_CLASS, MenuItem } from '@/components/ui/overlays/menu';
import Text from '@/components/ui/layout/Text';
import { RailTile } from '@/app/[locale]/app/rail/RailTile';
import RemoteImage from '@/components/ui/media/RemoteImage';

export default function ConcordRailTile({ community, active, onClick }: {
  community: ConcordCommunity; active: boolean; onClick: () => void;
}) {
  const t = useTranslations();
  const vm = useConcordRailTile(community, onClick);
  const { branding, anchorRef } = vm;
  return <div ref={anchorRef} onContextMenu={vm.openMenu}><RailTile title={branding.name} active={active} onClick={onClick}
    icon={branding.icon ? <RemoteImage src={branding.icon} alt="" className="h-full w-full rounded-[inherit] object-cover" data-testid="concord-rail-icon" />
      : <span className="text-lg font-bold">{branding.name.slice(0, 2).toUpperCase()}</span>} />
    <AnchoredMenu open={vm.menu} onClose={vm.closeMenu} anchorRef={anchorRef} align="start" width={220} panelClassName={MENU_PANEL_CLASS} testId="concord-rail-menu">
      <Text as="div" size="10" tone="muted" className="truncate px-3 py-2">{branding.name}</Text>
      <MenuItem label={t('shell.rail.switchTo')} onClick={vm.switchTo} />
      <MenuItem label={vm.copied ? t('common.copied') : t('chat.concord.copyId')} onClick={vm.copyId} />
      <MenuItem label={t('chat.concord.leave')} danger onClick={vm.leave} />
    </AnchoredMenu>
  </div>;
}
