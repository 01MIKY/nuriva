import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import type { Window } from '@/lib/bookings';
import { AvailabilityEditor } from '@/components/AvailabilityEditor';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.availability.title'), robots: { index: false } };
}

export default async function AvailabilityPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/signin`);
  if (me.body.user.role !== 'caregiver') redirect(`/${locale}/account`);
  const data = (await apiGet<{ windows: Window[] }>('/v1/caregiver/availability', locale)).body;
  return (
    <div className="n-container account">
      <Link href={`/${locale}/account`} className="back-link">← {t('web.nav.account')}</Link>
      <h1>{t('web.availability.title')}</h1>
      <p className="n-muted">{t('web.availability.intro')}</p>
      <AvailabilityEditor locale={locale} initial={data?.windows ?? []} />
    </div>
  );
}
