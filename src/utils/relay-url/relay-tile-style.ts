/** The letter a relay tile shows without an icon: the first letter of the registrable name. */
export function letterFor(host: string): string {
  const segs = host.split('.');
  const significant = segs.length >= 2 ? segs[segs.length - 2] : segs[0];
  return (significant[0] || '?').toUpperCase();
}

/** Stable hash → hue; saturated, dark enough for white text. */
export function colorFor(host: string): string {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}
