import type { ComponentType } from 'react';
import WhatIsObeliskHero from './WhatIsObeliskHero';
import HowObeliskWorksHero from './HowObeliskWorksHero';
import WotHero from './WotHero';
import FutureRelaysHero from './FutureRelaysHero';
import BitcoinZapsHero from './BitcoinZapsHero';
import AdminCliHero from './AdminCliHero';
import SwapAnythingHero from './SwapAnythingHero';
import WotGraphDiagram from './diagrams/WotGraphDiagram';
import RelayGroupsDiagram from './diagrams/RelayGroupsDiagram';
import ZapFlowDiagram from './diagrams/ZapFlowDiagram';
import SwapMatrixDiagram from './diagrams/SwapMatrixDiagram';
import {
  HERO_ASSET_META,
  DIAGRAM_ASSET_META,
  snapshotPaths,
  type GuideAssetMeta,
} from './asset-meta';

export const HERO_REGISTRY: Record<string, ComponentType> = {
  'what-is-obelisk': WhatIsObeliskHero,
  'how-obelisk-works': HowObeliskWorksHero,
  wot: WotHero,
  'future-relays': FutureRelaysHero,
  'bitcoin-zaps': BitcoinZapsHero,
  'admin-cli': AdminCliHero,
  'swap-anything': SwapAnythingHero,
};

export const DIAGRAM_REGISTRY: Record<string, ComponentType> = {
  'wot-graph': WotGraphDiagram,
  'relay-groups': RelayGroupsDiagram,
  'zap-flow': ZapFlowDiagram,
  'swap-matrix': SwapMatrixDiagram,
};

function IndexableSvg({
  name,
  Component,
  meta,
}: {
  name: string;
  Component: ComponentType;
  meta: GuideAssetMeta;
}) {
  const paths = snapshotPaths(name);
  return (
    <div className="relative w-full">
      {/* Plain <img>: hidden under the live <svg>, exists only as the indexable asset; next/image would re-encode lossily. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={paths.png}
        alt={meta.alt}
        width={meta.width}
        height={meta.height}
        className="block w-full h-auto"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0" aria-hidden="true">
        <Component />
      </div>
    </div>
  );
}

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

export function Diagram({ name, caption }: { name: string; caption?: string }) {
  const C = DIAGRAM_REGISTRY[name];
  const meta = DIAGRAM_ASSET_META[name];
  if (!C || !meta) return null;
  return (
    <figure className="my-10 w-full rounded-xl overflow-hidden border border-lc-border bg-lc-dark">
      <IndexableSvg name={name} Component={C} meta={meta} />
      {caption && (
        <figcaption className="px-4 py-3 text-sm text-lc-muted border-t border-lc-border">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
