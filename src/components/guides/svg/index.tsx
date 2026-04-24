import type { ComponentType } from 'react';
import WhatIsObeliskHero from './WhatIsObeliskHero';
import HowObeliskWorksHero from './HowObeliskWorksHero';
import WotHero from './WotHero';
import FutureRelaysHero from './FutureRelaysHero';
import BitcoinZapsHero from './BitcoinZapsHero';
import AdminCliHero from './AdminCliHero';
import AuthFlowDiagram from './diagrams/AuthFlowDiagram';
import WotGraphDiagram from './diagrams/WotGraphDiagram';
import RelayGroupsDiagram from './diagrams/RelayGroupsDiagram';
import ZapFlowDiagram from './diagrams/ZapFlowDiagram';

export const HERO_REGISTRY: Record<string, ComponentType> = {
  'what-is-obelisk': WhatIsObeliskHero,
  'how-obelisk-works': HowObeliskWorksHero,
  wot: WotHero,
  'future-relays': FutureRelaysHero,
  'bitcoin-zaps': BitcoinZapsHero,
  'admin-cli': AdminCliHero,
};

export const DIAGRAM_REGISTRY: Record<string, ComponentType> = {
  'auth-flow': AuthFlowDiagram,
  'wot-graph': WotGraphDiagram,
  'relay-groups': RelayGroupsDiagram,
  'zap-flow': ZapFlowDiagram,
};

export function SvgHero({ name }: { name: string }) {
  const C = HERO_REGISTRY[name];
  if (!C) return null;
  return (
    <div className="w-full rounded-xl overflow-hidden border border-lc-border bg-lc-dark">
      <C />
    </div>
  );
}

export function Diagram({ name, caption }: { name: string; caption?: string }) {
  const C = DIAGRAM_REGISTRY[name];
  if (!C) return null;
  return (
    <figure className="my-10 w-full rounded-xl overflow-hidden border border-lc-border bg-lc-dark">
      <C />
      {caption && (
        <figcaption className="px-4 py-3 text-sm text-lc-muted border-t border-lc-border">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
