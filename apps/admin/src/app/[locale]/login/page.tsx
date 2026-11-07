import { redirect } from 'next/navigation';
import { Card } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { StaffLoginForm } from '@/components/StaffLoginForm';

export default async function Login({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (me.body?.user?.role === 'admin') redirect(`/${locale}/caregivers`);
  if (me.body?.user) redirect(`/${locale}/no-access`);
  return (
    <div className="admin-narrow">
      <Card>
        <div className="n-stack">
          <h1 className="admin-h1">{t('admin.signInTitle')}</h1>
          <p className="n-muted">{t('admin.signInIntro')}</p>
          <StaffLoginForm locale={locale} />
        </div>
      </Card>
    </div>
  );
}
