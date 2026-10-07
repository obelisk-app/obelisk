/**
 * Canvas painting for Stacker blocks.
 *
 * Blocks are drawn **connected**: a cell only rounds the corners and draws
 * the bevel on edges where its neighbour is a different colour.
 */

const RADIUS_RATIO = 0.22;

/** Device pixel ratio for a crisp canvas, capped at 2. */
export function canvasDpr(): number {
  return typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
}

export interface Neighbours { up: boolean; down: boolean; left: boolean; right: boolean }

/**
 * One cell of a larger shape: rounded and bevelled only where it meets empty
 * space, square and seamless where it meets its own kind.
 */
export function drawConnected(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  n: Neighbours,
  flat: boolean,
): void {
  const r = size * RADIUS_RATIO;
  // Overlap by half a pixel into joined neighbours so no seam shows through.
  const bleed = 0.5;
  const left = x - (n.left ? bleed : 0);
  const top = y - (n.up ? bleed : 0);
  const right = x + size + (n.right ? bleed : 0);
  const bottom = y + size + (n.down ? bleed : 0);

  ctx.beginPath();
  path(ctx, left, top, right, bottom, {
    tl: !n.up && !n.left ? r : 0,
    tr: !n.up && !n.right ? r : 0,
    br: !n.down && !n.right ? r : 0,
    bl: !n.down && !n.left ? r : 0,
  });

  if (flat) {
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, mix(color, '#ffffff', 0.12));
    grad.addColorStop(1, mix(color, '#000000', 0.2));
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    const grad = ctx.createLinearGradient(x, y, x + size * 0.4, y + size);
    grad.addColorStop(0, mix(color, '#ffffff', 0.34));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, mix(color, '#000000', 0.3));
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Bevel: light along the outer top and left, shadow along bottom and right.
  ctx.lineWidth = Math.max(1, size * 0.07);
  if (!n.up) edge(ctx, x + r * 0.6, y + ctx.lineWidth / 2, x + size - r * 0.6, y + ctx.lineWidth / 2, 'rgba(255,255,255,0.5)');
  if (!n.left) edge(ctx, x + ctx.lineWidth / 2, y + r * 0.6, x + ctx.lineWidth / 2, y + size - r * 0.6, 'rgba(255,255,255,0.3)');
  if (!n.down) edge(ctx, x + r * 0.6, y + size - ctx.lineWidth / 2, x + size - r * 0.6, y + size - ctx.lineWidth / 2, 'rgba(0,0,0,0.45)');
  if (!n.right) edge(ctx, x + size - ctx.lineWidth / 2, y + r * 0.6, x + size - ctx.lineWidth / 2, y + size - r * 0.6, 'rgba(0,0,0,0.35)');
}

function edge(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stroke: string): void {
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function path(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
  r: { tl: number; tr: number; br: number; bl: number },
): void {
  ctx.moveTo(left + r.tl, top);
  ctx.lineTo(right - r.tr, top);
  if (r.tr) ctx.quadraticCurveTo(right, top, right, top + r.tr);
  ctx.lineTo(right, bottom - r.br);
  if (r.br) ctx.quadraticCurveTo(right, bottom, right - r.br, bottom);
  ctx.lineTo(left + r.bl, bottom);
  if (r.bl) ctx.quadraticCurveTo(left, bottom, left, bottom - r.bl);
  ctx.lineTo(left, top + r.tl);
  if (r.tl) ctx.quadraticCurveTo(left, top, left + r.tl, top);
  ctx.closePath();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  path(ctx, x, y, x + w, y + h, { tl: r, tr: r, br: r, bl: r });
}

export function mix(hex: string, other: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(other);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
