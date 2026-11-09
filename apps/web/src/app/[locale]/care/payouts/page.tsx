import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, Badge, Card, type BadgeTone } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { PayoutSetup } from '@/components/PayoutSetup';

type Status = 'none' | 'pending' | 'restricted' | 'active' | 'unsupported';
const TONE: Record<Status, BadgeTone> = { none: 'neutral', pending: 'pending', restricted: 'pending', active: 'ok', unsupported: 'danger' };
const KEY = { none: 'None', pending: 'Pending', restricted: 'Restricted', active: 'Active', unsupported: 'Unsupported' } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.payouts.title'), robots: { index: false } };
}

export default async function PayoutsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ return?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/signin`);
  if (me.body.user.role !== 'caregiver') redirect(`/${locale}/account`);
  const res = await apiGet<{ status: Status; paymentsEnabled: boolean }>('/v1/caregiver/payouts', locale);
  const { return: returned } = await searchParams;
  const status = res.body?.status;

  return (
    <div className="n-container account">
      <Link href={`/${locale}/account`} className="back-link">← {t('web.nav.account')}</Link>
      <h1>{t('web.payouts.title')}</h1>
      <p className="n-muted">{t('web.payouts.intro')}</p>
      {returned && <Alert>{t('web.payouts.returned')}</Alert>}
      {res.body && !res.body.paymentsEnabled && <Alert>{t('web.payouts.disabled')}</Alert>}
      {!status ? <Alert tone="error">{t('errors.payments_unavailable')}</Alert> : (
        <Card className={status === 'active' ? 'complete-card' : 'gaps-card'}>
          <div className="n-stack">
            <div className="approval-top">
              <h2 className="card-title">{t(`web.payouts.status${KEY[status]}`)}</h2>
              <Badge tone={TONE[status]}>{t(`web.payouts.status${KEY[status]}`)}</Badge>
            </div>
            <p>{t(`web.payouts.body${KEY[status]}`)}</p>
            {status === 'none' && <PayoutSetup locale={locale} label={t('web.payouts.start')} />}
            {(status === 'restricted' || status === 'pending') && <PayoutSetup locale={locale} label={t('web.payouts.continue')} />}
            <p className="n-hint">{t('web.payouts.feeNote')}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
