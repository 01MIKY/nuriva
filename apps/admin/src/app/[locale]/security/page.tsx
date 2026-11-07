import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SecuritySettings } from '@/components/SecuritySettings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('mfa.manage') };
}

/** Reachable even before MFA is enrolled (it is where staff enrol). Staff can never turn MFA off here. */
export default async function StaffSecurity({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/login`);
  if (me.body.user.role !== 'admin') redirect(`/${locale}/no-access`);
  return (
    <div className="admin-narrow n-stack" style={{ maxWidth: '640px' }}>
      <h1 className="admin-h1">{t('mfa.manage')}</h1>
      {me.body.mfaSetupRequired && <Alert tone="error"><strong>{t('mfa.setupRequiredTitle')}.</strong> {t('mfa.setupRequiredBody')}</Alert>}
      <SecuritySettings locale={locale} allowDisable={false} />
    </div>
  );
}
