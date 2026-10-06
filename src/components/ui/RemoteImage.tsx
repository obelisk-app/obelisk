import type { ImgHTMLAttributes } from 'react';

export type RemoteImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'referrerPolicy' | 'src' | 'alt'> & {
  src: string;
  /** Required on purpose: pass `""` for a decorative image, a description otherwise. */
  alt: string;
};

/**
 * An image someone else chose: a Nostr avatar, sticker, custom emoji, message
 * image or link-preview thumbnail.
 *
 * It is fetched from a host the author picked, so the privacy defaults live
 * here instead of in each call site: the referrer is never sent (the host is
 * not told which Obelisk page the reader is on) and loading is lazy. Before
 * this component, 55 files wrote their own <img> and many forgot the referrer.
 *
 * It is a plain <img> on purpose. next/image would route the author's URL
 * through this app's own optimizer: a server-side fetch of an attacker-chosen
 * URL, and a privacy leak. Whether the image may load at all (click-to-load in
 * DMs) is the caller's decision through the remote-media gate.
 */
export default function RemoteImage({ alt, loading = 'lazy', ...rest }: RemoteImageProps) {
  // The one sanctioned raw <img> for event media; see the comment above.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} loading={loading} {...rest} referrerPolicy="no-referrer" />;
}
