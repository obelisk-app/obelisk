/**
 * The development cards in a seat's hand, as the table lists them: an emoji,
 * the message key naming the card (null for a card type this client does not
 * know, which is then shown by its type), and whether it may be played yet.
 */
import type { DevCard } from 'vesta';
import type { MessageKey } from '@/i18n/keys';
import { DEV_CARD_KEY, DEV_EMOJI } from '@/components/games/vesta/resources';

export interface HandCard {
  key: string;
  cardType: string;
  emoji: string;
  labelKey: MessageKey | null;
  available: boolean;
}

export function handCards(hand: readonly DevCard[]): HandCard[] {
  return hand.map((card, i) => ({
    key: `${card.cardType}-${i}`,
    cardType: card.cardType,
    emoji: DEV_EMOJI[card.cardType] ?? '🎴',
    labelKey: card.cardType in DEV_CARD_KEY ? DEV_CARD_KEY[card.cardType as keyof typeof DEV_CARD_KEY] : null,
    available: card.available,
  }));
}
