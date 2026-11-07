'use client';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@nuriva/i18n';
import { Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

export function SignOutButtons({ locale }: { locale: Locale }) {
  const router = useRouter();
  const go = async (path: string) => {
    await apiPost(path, {}, locale);
    router.push(`/${locale}`);
    router.refresh();
  };
  return (
    <div className="n-row">
      <Button variant="secondary" onClick={() => go('/v1/auth/logout')}>{t(locale, 'auth.signOut')}</Button>
      <Button variant="quiet" onClick={() => go('/v1/auth/logout-all')}>{t(locale, 'web.account.signOutAll')}</Button>
    </div>
  );
}
