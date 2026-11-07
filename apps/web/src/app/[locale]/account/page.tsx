import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, ArtKids, ArtPets, Badge, Card, Icon, StepList, type StepStatus } from '@nuriva/ui';
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
  const done = vetting ? vetting.steps.filter((s) => s.status === 'passed').length : 0;
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="n-container account">
      <div className="account-head">
        <span className="account-avatar" aria-hidden="true">{firstName.slice(0, 1).toUpperCase()}</span>
        <div className="n-stack" style={{ ['--gap' as string]: '4px' }}>
          <h1>{t('web.account.hello', { name: firstName })}</h1>
          <p className="n-muted">{t(user.role === 'caregiver' ? 'web.account.caregiverIntro' : 'web.account.clientIntro')}</p>
        </div>
      </div>

      {vetting && (
        <Card className="approval-card">
          <div className="n-stack">
            <div className="approval-top">
              <h2 className="card-title">{t('web.account.approvalTitle')}</h2>
              <span className="approval-count" aria-hidden="true">{done}/{vetting.steps.length}</span>
            </div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={vetting.steps.length} aria-valuenow={done} aria-label={t('web.account.approvalTitle')}>
              <span style={{ width: `${(done / vetting.steps.length) * 100}%` }} />
            </div>
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
        <>
          <section className="n-stack" style={{ ['--gap' as string]: '12px' }}>
            <div className="approval-top">
              <h2 className="card-title">{t('web.home.need')}</h2>
              <Badge tone="pending">{t('web.account.soonBadge')}</Badge>
            </div>
            <div className="n-tiles">
              <Link href={`/${locale}#kids`} className="n-tile n-tile-kids">
                <ArtKids />
                <span><span className="n-tile-title">{t('web.home.tileKids')}</span><span className="n-tile-sub">{t('web.home.tileKidsSub')}</span></span>
              </Link>
              <Link href={`/${locale}#pets`} className="n-tile n-tile-pets">
                <ArtPets />
                <span><span className="n-tile-title">{t('web.home.tilePets')}</span><span className="n-tile-sub">{t('web.home.tilePetsSub')}</span></span>
              </Link>
            </div>
          </section>

          <Card>
            <div className="household">
              <span className="household-icon" aria-hidden="true"><Icon name="home" /></span>
              <div className="n-stack" style={{ ['--gap' as string]: '4px' }}>
                <div className="approval-top">
                  <h2 className="card-title">{t('web.account.householdTitle')}</h2>
                  <Badge>{t('web.account.soonBadge')}</Badge>
                </div>
                <p className="n-muted">{t('web.account.householdSoon')}</p>
              </div>
            </div>
          </Card>
        </>
      )}

      <SignOutButtons locale={locale} />
    </div>
  );
}
