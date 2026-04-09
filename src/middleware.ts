import { NextResponse, type NextRequest } from 'next/server';
import { countryToLocale } from './i18n/index';

export function middleware(request: NextRequest) {
  // If locale cookie already set, skip detection
  if (request.cookies.get('locale')) {
    return NextResponse.next();
  }

  // Read geo headers from hosting providers
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    null;

  const locale = countryToLocale(country);

  const response = NextResponse.next();
  response.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  return response;
}

export const config = {
  matcher: ['/'],
};
