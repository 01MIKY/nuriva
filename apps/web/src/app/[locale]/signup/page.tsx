import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SignUpForm } from '@/components/SignUpForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('auth.createAccount') };
}

export default async function SignUpPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (me.body?.user) redirect(`/${locale}/account`);
  const { role } = await searchParams;

  return (
    <div className="n-container auth-wrap">
      <Card className="auth-card">
        <div className="n-stack">
          <h1 className="auth-title">{t('web.auth.signUpTitle')}</h1>
          <SignUpForm locale={locale} initialRole={role === 'caregiver' ? 'caregiver' : 'client'} />
          <p className="n-muted auth-switch">
            {t('web.auth.haveAccount')} <Link href={`/${locale}/signin`}>{t('auth.signIn')}</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
