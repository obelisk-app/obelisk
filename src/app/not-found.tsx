'use client';

import NextError from 'next/error';

/**
 * A request no route matched and the proxy never localised (a path with a
 * file extension, say). It renders outside `[locale]`, so it owns `<html>`.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <NextError statusCode={404} />
      </body>
    </html>
  );
}
