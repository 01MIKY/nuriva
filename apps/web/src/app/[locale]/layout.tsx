import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import { Logo } from '@nuriva/ui';
import '@nuriva/ui/styles.css';
import '../web.css';
import { resolveLocale, translator, otherLocale } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-display', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });

// Pages depend on the visitor's session, so they are rendered per request (never cached across users).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  return {
    title: { default: `NURIVA · ${t('brand.tagline')}`, template: '%s · NURIVA' },
    description: t('web.home.subtitle'),
    alternates: { languages: { en: '/en', es: '/es' } },
    icons: { icon: '/icon.svg' },
    manifest: '/manifest.webmanifest',
    // The test deployment must never be indexed by search engines.
    ...(process.env.NURIVA_ENV === 'staging' ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F5F2EC' }, { media: '(prefers-color-scheme: dark)', color: '#0E1A2B' }],
  viewportFit: 'cover',
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user ?? null;

  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip-link" href="#main">{t('web.nav.skip')}</a>
        {process.env.NURIVA_ENV === 'staging' && <div className="staging-banner" role="note">{t('staging.banner')}</div>}
        <header className="site-header">
          <div className="n-container site-header-inner">
            <Link href={`/${locale}`} aria-label="NURIVA"><Logo size={30} /></Link>
            <nav className="site-nav" aria-label="Main">
              <Link href={`/${locale}/search?division=kids`} className="hide-sm">{t('web.nav.kids')}</Link>
              <Link href={`/${locale}/search?division=pets`} className="hide-sm">{t('web.nav.pets')}</Link>
              <Link href={`/${locale}#how`} className="hide-sm">{t('web.nav.howItWorks')}</Link>
              <LanguageSwitch target={otherLocale(locale)} label={t('web.nav.language')} />
              {user && user.role !== 'admin' && <Link href={`/${locale}/bookings`} className="hide-sm">{t('web.nav.bookings')}</Link>}
              {user
                ? <Link href={`/${locale}/account`} className="n-btn n-btn-quiet nav-cta">{t('web.nav.account')}</Link>
                : <Link href={`/${locale}/signin`} className="n-btn n-btn-quiet nav-cta">{t('auth.signIn')}</Link>}
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="n-container footer-inner">
            <p className="n-muted">{t('safety.disclaimer')}</p>
            <div className="n-row footer-links">
              <span>{t('web.footer.rights')}</span>
              <span>{t('web.footer.privacy')}</span>
              <span>{t('web.footer.terms')}</span>
              <span>{t('web.footer.accessibility')}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
