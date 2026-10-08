/**
 * Draws a preview card: the one renderer (`next/og`'s `ImageResponse`,
 * satori underneath) for the live route and for `npm run snap-og`, so a
 * static card on disk and a live one look alike, pixel for pixel.
 */

import type { ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import { OG_SIZE } from '@/constants/seo/og';

/** The card as a 1200x630 PNG response, with the given Cache-Control (else the renderer's default). */
export function drawCard(element: ReactElement, cacheControl?: string): ImageResponse {
  return new ImageResponse(element, { ...OG_SIZE, ...(cacheControl ? { headers: { 'cache-control': cacheControl } } : {}) });
}

/** The card as PNG bytes, for a file. */
export async function drawCardPng(element: ReactElement): Promise<Buffer> {
  return Buffer.from(await drawCard(element).arrayBuffer());
}
