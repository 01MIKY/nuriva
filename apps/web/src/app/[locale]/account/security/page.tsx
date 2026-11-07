import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SecuritySettings } from '@/components/SecuritySettings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('mfa.manage'), robots: { index: false } };
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  return (
    <div className="n-container account">
      <Link href={`/${locale}/account`} className="back-link">← {t('web.nav.account')}</Link>
      <h1>{t('mfa.manage')}</h1>
      <SecuritySettings locale={locale} allowDisable={user.role === 'client'} />
    </div>
  );
}
