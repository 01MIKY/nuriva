import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SignInForm } from '@/components/SignInForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('auth.signIn') };
}

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (me.body?.user) redirect(`/${locale}/account`);

  return (
    <div className="n-container auth-wrap">
      <Card className="auth-card">
        <div className="n-stack">
          <h1 className="auth-title">{t('web.auth.signInTitle')}</h1>
          <SignInForm locale={locale} />
          <p className="n-muted auth-switch">
            {t('web.auth.noAccount')} <Link href={`/${locale}/signup`}>{t('auth.createAccount')}</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
