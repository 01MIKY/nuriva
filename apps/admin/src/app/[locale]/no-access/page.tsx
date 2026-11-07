import { Alert } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { SignOut } from '@/components/SignOut';

export default async function NoAccess({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  return (
    <div className="admin-narrow n-stack">
      <Alert tone="error">{t('admin.noAccess')}</Alert>
      <SignOut locale={locale} label={t('auth.signOut')} />
    </div>
  );
}
