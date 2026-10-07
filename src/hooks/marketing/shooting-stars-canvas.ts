/**
 * The shooting-stars animation behind `ShootingStars`
 * (`src/components/common/ShootingStars.tsx`): a pool of streaks that wait a
 * few seconds, cross the canvas from top right to bottom left, fade in, and
 * start over somewhere else once they leave it.
 *
 * `resetStar` and `stepStar` are the per-streak rules, kept apart from the
 * canvas so they can be tested; `startShootingStars` sizes the canvas, runs
 * the frame loop and returns the function that stops it.
 */

export interface Star {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
  active: boolean;
  timer: number;
  interval: number;
}

/** Top right to bottom left. */
const ANGLE = (155 * Math.PI) / 180;
const COS_A = Math.cos(ANGLE);
const SIN_A = Math.sin(ANGLE);

/** Park a streak: hidden, waiting 3 to 11 s, at a fresh spot in the upper part of a `width` x `height` canvas. */
export function resetStar(s: Star, width: number, height: number, random: () => number = Math.random): void {
  s.active = false;
  s.timer = 0;
  s.interval = 3000 + random() * 8000; // 3-11s between appearances
  s.x = random() * width * 0.8 + width * 0.1;
  s.y = random() * height * 0.6;
  s.len = 60 + random() * 80;
  s.speed = 400 + random() * 300;
  s.opacity = 0;
}

/** A pool of `count` streaks whose first appearances are staggered over the first 6 s. */
export function createStars(count: number, width: number, height: number, random: () => number = Math.random): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const s: Star = { x: 0, y: 0, len: 0, speed: 0, opacity: 0, active: false, timer: 0, interval: 0 };
    resetStar(s, width, height, random);
    s.interval = random() * 6000; // stagger initial appearance
    stars.push(s);
  }
  return stars;
}

/**
 * Advance one streak by `dt` seconds. Returns true when it should be drawn
 * this frame: a waiting streak only counts down, and one that left the
 * canvas is parked again.
 */
export function stepStar(s: Star, dt: number, width: number, height: number, random: () => number = Math.random): boolean {
  if (!s.active) {
    s.timer += dt * 1000;
    if (s.timer >= s.interval) {
      s.active = true;
      s.opacity = 0;
    }
    return false;
  }

  s.x += COS_A * s.speed * dt;
  s.y += SIN_A * s.speed * dt;

  // Fade in then hold.
  if (s.opacity < 0.9) {
    s.opacity = Math.min(s.opacity + dt * 4, 0.9);
  }

  if (s.x < -100 || s.x > width + 100 || s.y > height + 100) {
    resetStar(s, width, height, random);
    return false;
  }
  return true;
}

function drawStar(ctx: CanvasRenderingContext2D, s: Star): void {
  const tailX = s.x - COS_A * s.len;
  const tailY = s.y - SIN_A * s.len;

  const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
  grad.addColorStop(0, `rgba(180, 249, 83, 0)`);
  grad.addColorStop(1, `rgba(180, 249, 83, ${s.opacity})`);

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(s.x, s.y);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Bright head dot
  ctx.beginPath();
  ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(180, 249, 83, ${s.opacity})`;
  ctx.fill();
}

/**
 * Run the animation on `canvas` until the returned function is called.
 * `contained` sizes it to its parent (followed with a ResizeObserver, for a
 * card); otherwise it follows the window.
 */
export function startShootingStars(canvas: HTMLCanvasElement, { contained, count }: { contained: boolean; count: number }): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const parent = contained ? canvas.parentElement : null;
  const resize = () => {
    if (contained && parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    } else {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  };
  resize();
  let ro: ResizeObserver | null = null;
  if (contained && parent && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    ro.observe(parent);
  } else {
    window.addEventListener('resize', resize);
  }

  const stars = createStars(count, canvas.width, canvas.height);
  let lastTime = performance.now();
  let animId: number;

  const draw = (now: number) => {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      if (stepStar(s, dt, canvas.width, canvas.height)) drawStar(ctx, s);
    }
    animId = requestAnimationFrame(draw);
  };
  animId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(animId);
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', resize);
  };
}
