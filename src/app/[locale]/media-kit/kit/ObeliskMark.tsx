// Obelisk silhouette: same artwork as /og/obelisk.png so banners stay
// visually identical to the share preview.
export function ObeliskMark({
  width = '100%',
  height = '100%',
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      aria-hidden
    >
      <path
        d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z"
        fill="#a3a3a3"
        opacity={0.7}
      />
      <path
        d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z"
        fill="#fafafa"
      />
    </svg>
  );
}
