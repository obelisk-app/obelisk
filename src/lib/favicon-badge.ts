/**
 * Dynamically badge the browser tab's favicon with an unread count.
 *
 * Draws the base favicon onto an offscreen <canvas>, overlays a red circle
 * with the count ("99+" when > 99), exports the result as a PNG dataURL and
 * swaps the document's `<link rel="icon">` href to it. Restoring the original
 * favicon is handled by `clearBadge()`.
 *
 * Design notes:
 *  - Next.js serves the app favicon at `/favicon.ico`, and usually injects
 *    its own `<link rel="icon">` at runtime. We grab whatever icon is
 *    currently in the DOM, but fall back to `/favicon.ico` if none is found.
 *  - The base favicon is loaded lazily on first call and cached as an
 *    HTMLImageElement so subsequent updates are cheap.
 *  - If canvas APIs are unavailable (SSR, blocked by CSP, ancient browser)
 *    we silently no-op rather than throwing.
 */

const BADGE_SIZE = 64; // canvas resolution — upscales favicon for crisp rendering
const LINK_SELECTORS = [
  "link[rel~='icon']",
  "link[rel='shortcut icon']",
] as const;

type BaseState = {
  img: HTMLImageElement;
  originalHref: string;
};

let baseStatePromise: Promise<BaseState | null> | null = null;
let lastBadgeValue: number | null = null;

/** Find an existing favicon `<link>` or create one. */
function ensureIconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;

  for (const selector of LINK_SELECTORS) {
    const existing = document.querySelector<HTMLLinkElement>(selector);
    if (existing) return existing;
  }

  // No favicon link in DOM — create one pointing at the conventional path.
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/favicon.ico';
  document.head.appendChild(link);
  return link;
}

/** Load (and cache) the base favicon image. Returns null if unavailable. */
function loadBaseIcon(): Promise<BaseState | null> {
  if (baseStatePromise) return baseStatePromise;

  baseStatePromise = new Promise((resolve) => {
    const link = ensureIconLink();
    if (!link) {
      resolve(null);
      return;
    }
    const href = link.href || '/favicon.ico';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ img, originalHref: href });
    img.onerror = () => resolve(null);
    img.src = href;
  });

  return baseStatePromise;
}

/** Get a 2D canvas context or null if canvas is unsupported. */
function getContext(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_SIZE;
  canvas.height = BADGE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

/** Format the numeric count into a short label. */
export function formatBadgeLabel(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(Math.floor(count));
}

/**
 * Set the favicon badge to `count`. Pass 0 to clear (same as `clearBadge`).
 * Safe to call repeatedly — no-ops when the value hasn't changed.
 */
export async function setBadgeCount(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(count));
  if (lastBadgeValue === safeCount) return;
  lastBadgeValue = safeCount;

  if (safeCount === 0) {
    await clearBadge();
    return;
  }

  const base = await loadBaseIcon();
  const link = ensureIconLink();
  if (!link) return;

  const surface = getContext();
  if (!surface) return;
  const { canvas, ctx } = surface;

  // Paint base image (upscaled). If the base failed to load, we still draw
  // the red dot on a transparent background so the user gets SOME signal.
  ctx.clearRect(0, 0, BADGE_SIZE, BADGE_SIZE);
  if (base) {
    try {
      ctx.drawImage(base.img, 0, 0, BADGE_SIZE, BADGE_SIZE);
    } catch {
      // drawImage can throw on tainted canvases (cross-origin w/o CORS).
      // Fall through — the dot still renders.
    }
  }

  // Red circle — bottom-right quadrant, ~45% of canvas.
  const radius = BADGE_SIZE * 0.32;
  const cx = BADGE_SIZE - radius - 2;
  const cy = BADGE_SIZE - radius - 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444'; // red-500
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0a0a0a'; // lc-black halo for contrast on light favicons
  ctx.stroke();

  // Label
  const label = formatBadgeLabel(safeCount);
  const fontSize = label.length >= 3 ? radius * 0.9 : radius * 1.15;
  ctx.font = `bold ${fontSize}px -apple-system, system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);

  try {
    const dataUrl = canvas.toDataURL('image/png');
    link.href = dataUrl;
  } catch {
    // toDataURL fails on tainted canvases — leave favicon untouched.
  }
}

/** Restore the original favicon. */
export async function clearBadge(): Promise<void> {
  lastBadgeValue = 0;
  const base = await loadBaseIcon();
  const link = ensureIconLink();
  if (!link) return;
  if (base) {
    link.href = base.originalHref;
  }
}

/** Test-only: reset internal caches so unit tests stay isolated. */
export function __resetFaviconBadgeForTests(): void {
  baseStatePromise = null;
  lastBadgeValue = null;
}
