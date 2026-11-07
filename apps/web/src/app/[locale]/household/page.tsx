import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Icon } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import type { Household } from '@/lib/household';
import { HouseholdManager } from '@/components/HouseholdManager';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.household.title'), robots: { index: false } };
}

export default async function HouseholdPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  if (user.role !== 'client') redirect(`/${locale}/account`);
  const household = (await apiGet<Household>('/v1/household', locale)).body ?? { dependents: [], emergencyContact: null };

  return (
    <div className="n-container account">
      <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
        <h1>{t('web.household.title')}</h1>
        <p className="n-muted">{t('web.household.intro')}</p>
        <p className="privacy-note"><Icon name="shield" size={16} /> {t('web.household.privacy')}</p>
      </div>
      <HouseholdManager locale={locale} initial={household} />
    </div>
  );
}
