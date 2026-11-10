import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import { hasPermission } from '@nuriva/domain';
import { LogoMark } from '@nuriva/ui';
import '@nuriva/ui/styles.css';
import '../admin.css';
import { resolveLocale, translator, otherLocale } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { SignOut } from '@/components/SignOut';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-display', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = translator(await resolveLocale(params));
  return { title: { default: t('admin.title'), template: `%s · ${t('admin.title')}` }, robots: { index: false, follow: false }, icons: { icon: '/icon.svg' } };
}

export const viewport: Viewport = { themeColor: '#172A43', viewportFit: 'cover' };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const staff = me.body?.user?.role === 'admin' ? me.body.user : null;
  const nav = staff ? [
    { href: 'caregivers', label: t('admin.nav.caregivers'), show: hasPermission(staff.staffRoles, 'caregivers.read') },
    { href: 'compliance', label: t('admin.nav.compliance'), show: hasPermission(staff.staffRoles, 'caregivers.read') },
    { href: 'incidents', label: t('admin.nav.incidents'), show: hasPermission(staff.staffRoles, 'incidents.manage') },
    { href: 'reviews', label: t('admin.nav.reviews'), show: hasPermission(staff.staffRoles, 'reviews.moderate') },
    { href: 'audit', label: t('admin.nav.audit'), show: hasPermission(staff.staffRoles, 'audit.read') },
    { href: 'security', label: t('mfa.manage'), show: true },
  ].filter((n) => n.show) : [];

  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body className="admin">
        <header className="admin-bar">
          <div className="admin-bar-inner">
            <Link href={`/${locale}/caregivers`} className="admin-brand"><LogoMark size={28} inverted /><span>{t('admin.title')}</span></Link>
            {staff && (
              <nav className="admin-nav" aria-label="Admin">
                {nav.map((n) => <Link key={n.href} href={`/${locale}/${n.href}`}>{n.label}</Link>)}
              </nav>
            )}
            <div className="admin-user">
              <LanguageSwitch target={otherLocale(locale)} label={otherLocale(locale).toUpperCase()} />
              {staff && (
                <>
                  <span className="admin-who">
                    {t('admin.signedInAs', { name: staff.name })}
                    <small>{staff.staffRoles.map((r) => t(`admin.roles.${r}`)).join(' · ')}</small>
                  </span>
                  <SignOut locale={locale} label={t('auth.signOut')} />
                </>
              )}
            </div>
          </div>
        </header>
        <main className="admin-main">{children}</main>
      </body>
    </html>
  );
}
