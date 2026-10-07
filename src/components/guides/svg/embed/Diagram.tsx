import { DIAGRAM_ASSET_META } from '@/utils/guides/asset-meta';
import { DIAGRAM_REGISTRY } from '../index';
import IndexableSvg from './IndexableSvg';

/** A diagram in an article: the live drawing over its still frame, with an optional caption. */
export default function Diagram({ name, caption }: { name: string; caption?: string }) {
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
