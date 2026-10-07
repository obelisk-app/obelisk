/**
 * The small green obelisk in the corner of every Open Graph card (the site's
 * cards and the guide cards), drawn for Satori: fixed size, literal colours.
 */
export default function ObeliskOgMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <polygon points="24,4 30,40 18,40" fill="#b4f953" />
      <rect x="16" y="40" width="16" height="3" fill="#8bc34a" />
    </svg>
  );
}
