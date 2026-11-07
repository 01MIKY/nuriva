import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { CaregiverProfileView } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { CaregiverProfileForm } from '@/components/CaregiverProfileForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.care.title'), robots: { index: false } };
}

type Gap = 'headline' | 'bio' | 'services' | 'languages' | 'zip';

export default async function CaregiverProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  if (user.role !== 'caregiver') redirect(`/${locale}/account`);
  const data = (await apiGet<{ profile: CaregiverProfileView; gaps: Gap[] }>('/v1/caregiver/profile', locale)).body;
  if (!data) redirect(`/${locale}/account`);

  return (
    <div className="n-container account">
      <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
        <h1>{t('web.care.title')}</h1>
        <p className="n-muted">{t('web.care.intro')}</p>
      </div>
      <CaregiverProfileForm locale={locale} initial={data.profile} initialGaps={data.gaps} />
    </div>
  );
}
