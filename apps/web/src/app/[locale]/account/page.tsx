import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, Card, StepList, type StepStatus } from '@nuriva/ui';
import type { VettingStep } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SignOutButtons } from '@/components/SignOutButtons';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.nav.account'), robots: { index: false } };
}

interface Vetting {
  steps: Array<{ step: VettingStep; status: StepStatus }>;
  canAcceptBookings: boolean;
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);

  const vetting = user.role === 'caregiver' ? (await apiGet<Vetting>('/v1/caregiver/vetting', locale)).body : null;

  return (
    <div className="n-container account">
      <div className="n-stack" style={{ ['--gap' as string]: '24px' }}>
        <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
          <h1>{t('web.account.hello', { name: user.name.split(' ')[0] ?? user.name })}</h1>
          <p className="n-muted">{t(user.role === 'caregiver' ? 'web.account.caregiverIntro' : 'web.account.clientIntro')}</p>
        </div>

        {vetting && (
          <Card>
            <div className="n-stack">
              <h2 className="card-title">{t('web.account.approvalTitle')}</h2>
              <StepList steps={vetting.steps.map((s) => ({
                key: s.step,
                label: t(`vetting.steps.${s.step}`),
                status: s.status,
                statusLabel: t(`vetting.status.${s.status}`),
              }))} />
              {!vetting.canAcceptBookings && <Alert>{t('vetting.blocked')}</Alert>}
            </div>
          </Card>
        )}

        {user.role === 'client' && (
          <Card>
            <div className="n-stack">
              <h2 className="card-title">{t('web.account.nextStepsTitle')}</h2>
              <ul className="next-list">
                <li>{t('web.account.nextHousehold')}</li>
                <li>{t('web.account.nextSearch')}</li>
              </ul>
            </div>
          </Card>
        )}

        <SignOutButtons locale={locale} />
      </div>
    </div>
  );
}
