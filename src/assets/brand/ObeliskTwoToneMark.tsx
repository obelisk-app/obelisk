import type { SVGProps } from 'react';

/**
 * The Obelisco in two tones: the left face at 70% opacity beside the solid
 * right face, the same artwork as `/og/obelisk.png`. With no fills it takes
 * the `fill` it is given (`currentColor` above the phone login); the media-kit
 * banners paint each face (`leftFill`, `rightFill`) so they match the share
 * preview exactly.
 */
export default function ObeliskTwoToneMark({ leftFill, rightFill, ...props }: SVGProps<SVGSVGElement> & { leftFill?: string; rightFill?: string }) {
  return (
    <svg viewBox="0 0 512 512" {...props}>
      <path d="M256,16 L220,72 L196,460 L200,464 L256,464 L256,72 Z" fill={leftFill} opacity="0.7" />
      <path d="M256,16 L292,72 L316,460 L312,464 L256,464 L256,72 Z" fill={rightFill} />
    </svg>
  );
}
