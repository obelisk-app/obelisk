import type { ComponentType } from 'react';
import WhatIsObeliskHero from './heroes/WhatIsObeliskHero';
import HowObeliskWorksHero from './heroes/HowObeliskWorksHero';
import WotHero from './heroes/WotHero';
import FutureRelaysHero from './heroes/FutureRelaysHero';
import BitcoinZapsHero from './heroes/BitcoinZapsHero';
import AdminCliHero from './heroes/AdminCliHero';
import SwapAnythingHero from './heroes/SwapAnythingHero';
import ObeliskBotsHero from './heroes/ObeliskBotsHero';
import QuantumSafeHero from './heroes/QuantumSafeHero';
import ChainReactionHero from './heroes/ChainReactionHero';
import VestaHero from './heroes/VestaHero';
import StackerHero from './heroes/StackerHero';
import RelayHero from './heroes/RelayHero';
import WotGraphDiagram from './diagrams/WotGraphDiagram';
import RelayGroupsDiagram from './diagrams/RelayGroupsDiagram';
import ZapFlowDiagram from './diagrams/ZapFlowDiagram';
import SwapMatrixDiagram from './diagrams/SwapMatrixDiagram';
import DexMark from './marks/DexMark';
import SfuMark from './marks/SfuMark';
import BotsMark from './marks/BotsMark';
import RelayMark from './marks/RelayMark';
import { HERO_ASSET_META } from '@/constants/guides/asset-meta';
import IndexableSvg from './embed/IndexableSvg';

/**
 * Every guide hero and diagram by the name an article's frontmatter or MDX
 * uses. `SvgHero` below embeds a hero; `embed/Diagram.tsx` and
 * `embed/Mark.tsx` embed the rest.
 */
export const HERO_REGISTRY: Record<string, ComponentType> = {
  'what-is-obelisk': WhatIsObeliskHero,
  'how-obelisk-works': HowObeliskWorksHero,
  wot: WotHero,
  'future-relays': FutureRelaysHero,
  'bitcoin-zaps': BitcoinZapsHero,
  'admin-cli': AdminCliHero,
  'swap-anything': SwapAnythingHero,
  'obelisk-bots': ObeliskBotsHero,
  'quantum-safe': QuantumSafeHero,
  'chain-reaction': ChainReactionHero,
  vesta: VestaHero,
  stacker: StackerHero,
  'run-your-own-relay': RelayHero,
};

export const DIAGRAM_REGISTRY: Record<string, ComponentType> = {
  'wot-graph': WotGraphDiagram,
  'relay-groups': RelayGroupsDiagram,
  'zap-flow': ZapFlowDiagram,
  'swap-matrix': SwapMatrixDiagram,
  'mark-dex': DexMark,
  'mark-sfu': SfuMark,
  'mark-bots': BotsMark,
  'mark-relay': RelayMark,
};

/** An article's hero: the live drawing over its indexable still frame. */
export function SvgHero({ name }: { name: string }) {
  const C = HERO_REGISTRY[name];
  const meta = HERO_ASSET_META[name];
  if (!C || !meta) return null;
  return (
    <div className="w-full rounded-xl overflow-hidden border border-lc-border bg-lc-dark">
      <IndexableSvg name={name} Component={C} meta={meta} />
    </div>
  );
}
