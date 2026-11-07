import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, negotiateLocale } from '@nuriva/i18n';

/** Every page lives under /en or /es. Bare paths redirect to the visitor's preferred language. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];
  if ((LOCALES as readonly string[]).includes(first ?? '')) return NextResponse.next();
  const locale = req.cookies.get('nuriva_locale')?.value === 'es' ? 'es'
    : req.cookies.get('nuriva_locale')?.value === 'en' ? 'en'
    : negotiateLocale(req.headers.get('accept-language') ?? undefined);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!api|_next|favicon.ico|icon.svg).*)'] };
