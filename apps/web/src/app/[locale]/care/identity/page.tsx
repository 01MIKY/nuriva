import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, Badge, Card, type BadgeTone } from '@nuriva/ui';
import type { MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { IdentityStart } from '@/components/IdentityStart';

type Status = 'none' | 'requires_input' | 'processing' | 'verified' | 'canceled';
const TONE: Record<Status, BadgeTone> = { none: 'neutral', requires_input: 'pending', processing: 'pending', verified: 'ok', canceled: 'neutral' };
const key = (s: Status) => (s.charAt(0).toUpperCase() + s.slice(1)) as 'None';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.identity.title'), robots: { index: false } };
}

export default async function IdentityPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ return?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/signin`);
  if (me.body.user.role !== 'caregiver') redirect(`/${locale}/account`);
  const res = (await apiGet<{ status: Status; errorCode: string | null }>('/v1/caregiver/identity', locale)).body;
  const { return: returned } = await searchParams;

  return (
    <div className="n-container account">
      <Link href={`/${locale}/account`} className="back-link">← {t('web.nav.account')}</Link>
      <h1>{t('web.identity.title')}</h1>
      <p className="n-muted">{t('web.identity.intro')}</p>
      {returned && <Alert>{t('web.identity.returned')}</Alert>}
      {!res ? <Alert tone="error">{t('errors.payments_unavailable')}</Alert> : (
        <Card className={res.status === 'verified' ? 'complete-card' : 'gaps-card'}>
          <div className="n-stack">
            <div className="approval-top">
              <h2 className="card-title">{t(`web.identity.status${key(res.status)}` as MessageKey)}</h2>
              <Badge tone={TONE[res.status]}>{t(`web.identity.status${key(res.status)}` as MessageKey)}</Badge>
            </div>
            <p>{t(`web.identity.body${key(res.status)}` as MessageKey)}</p>
            {res.errorCode && <Alert tone="error">{t('web.identity.retry', { code: res.errorCode })}</Alert>}
            {(res.status === 'none' || res.status === 'canceled') && <IdentityStart locale={locale} label={t('web.identity.start')} />}
            {res.status === 'requires_input' && <IdentityStart locale={locale} label={t('web.identity.resume')} />}
          </div>
        </Card>
      )}
    </div>
  );
}
