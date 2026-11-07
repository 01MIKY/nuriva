'use client';
import { useRouter } from 'next/navigation';
import type { Locale } from '@nuriva/i18n';
import { apiPost } from '@/lib/client-api';

export function SignOut({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  return (
    <button type="button" className="admin-signout" onClick={async () => { await apiPost('/v1/auth/logout', {}, locale); router.push(`/${locale}/login`); router.refresh(); }}>
      {label}
    </button>
  );
}
