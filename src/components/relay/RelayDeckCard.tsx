import { useRelayDeckCard } from '@/hooks/relay/rail/useRelayDeckCard';
import CommunityDeckCard, { type CommunityDeckPosition } from './CommunityDeckCard';

export default function RelayDeckCard({ url, onRemove, removeLabel, removeDisabled, ...position }: CommunityDeckPosition & {
  url: string; onRemove: () => void; removeLabel: string; removeDisabled: boolean;
}) {
  const branding = useRelayDeckCard(url, position.active);
  return <CommunityDeckCard {...position} {...branding} sourceKey={url} testId="relay-deck-card"
    removal={{ onRemove, label: removeLabel, disabled: removeDisabled }} />;
}
