import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, ArtKids, ArtPets, Badge, Card, Icon, StepList, buttonClass, type StepStatus } from '@nuriva/ui';
import type { Household } from '@/lib/household';
import type { VettingStep } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { SignOutButtons } from '@/components/SignOutButtons';
import { LevelCard, type OwnReputation } from '@/components/Reputation';

/** "2 hijos · 1 mascota" — singular/plural per language, zero counts omitted. */
function householdSummary(t: ReturnType<typeof translator>, children: number, pets: number) {
  const parts: string[] = [];
  if (children) parts.push(children === 1 ? t('web.household.childOne') : t('web.household.childMany', { n: children }));
  if (pets) parts.push(pets === 1 ? t('web.household.petOne') : t('web.household.petMany', { n: pets }));
  return parts.join(' · ');
}

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
  const household = user.role === 'client' ? (await apiGet<Household>('/v1/household', locale)).body : null;
  const profile = user.role === 'caregiver' ? (await apiGet<{ gaps: string[] }>('/v1/caregiver/profile', locale)).body : null;
  const reputation = vetting?.canAcceptBookings ? (await apiGet<OwnReputation>('/v1/caregiver/reputation', locale)).body : null;
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

      {me.body?.mfaSetupRequired && (
        <Alert tone="error">
          <strong>{t('mfa.setupRequiredTitle')}.</strong> {t('mfa.setupRequiredBody')}{' '}
          <Link href={`/${locale}/account/security`}>{t('mfa.manage')}</Link>
        </Alert>
      )}

      {profile && (
        <Card className={profile.gaps.length ? 'gaps-card' : 'complete-card'}>
          <div className="household">
            <span className="household-icon" aria-hidden="true"><Icon name="user" /></span>
            <div className="n-stack" style={{ ['--gap' as string]: '6px' }}>
              <h2 className="card-title">{t(profile.gaps.length ? 'web.care.gapsTitle' : 'web.care.completeTitle')}</h2>
              {profile.gaps.length
                ? <ul className="gap-list">{profile.gaps.map((g) => <li key={g}>{t(`web.care.gaps.${g as 'headline'}`)}</li>)}</ul>
                : <p className="n-muted">{t('web.care.completeBody')}</p>}
              <Link className={buttonClass(profile.gaps.length ? 'primary' : 'quiet')} href={`/${locale}/care/profile`}>{t('web.care.editProfile')}</Link>
            </div>
          </div>
        </Card>
      )}

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

      {reputation && <LevelCard t={t} locale={locale} data={reputation} />}

      {user.role === 'client' && (
        <>
          <section className="n-stack" style={{ ['--gap' as string]: '12px' }}>
            <div className="approval-top">
              <h2 className="card-title">{t('web.home.need')}</h2>
            </div>
            <div className="n-tiles">
              <Link href={`/${locale}/search?division=kids`} className="n-tile n-tile-kids">
                <ArtKids />
                <span><span className="n-tile-title">{t('web.home.tileKids')}</span><span className="n-tile-sub">{t('web.home.tileKidsSub')}</span></span>
              </Link>
              <Link href={`/${locale}/search?division=pets`} className="n-tile n-tile-pets">
                <ArtPets />
                <span><span className="n-tile-title">{t('web.home.tilePets')}</span><span className="n-tile-sub">{t('web.home.tilePetsSub')}</span></span>
              </Link>
            </div>
          </section>

          <Card>
            <div className="household">
              <span className="household-icon" aria-hidden="true"><Icon name="home" /></span>
              <div className="n-stack" style={{ ['--gap' as string]: '6px' }}>
                <h2 className="card-title">{t('web.account.householdTitle')}</h2>
                <p className="n-muted">{household && household.dependents.length > 0
                  ? householdSummary(t, household.dependents.filter((d) => d.kind === 'child').length, household.dependents.filter((d) => d.kind === 'pet').length)
                  : t('web.household.emptyBody')}</p>
                <Link className={buttonClass('primary')} href={`/${locale}/household`}>{t('web.household.manage')}</Link>
              </div>
            </div>
          </Card>
        </>
      )}

      <nav className="quick-links" aria-label={t('web.nav.account')}>
        {user.role !== 'admin' && (
          <Link className="quick-link" href={`/${locale}/bookings`}>
            <Icon name="calendar" /> {t(user.role === 'caregiver' ? 'web.bookings.titleCaregiver' : 'web.bookings.title')}
          </Link>
        )}
        {user.role === 'caregiver' && (
          <Link className="quick-link" href={`/${locale}/care/availability`}><Icon name="home" /> {t('web.availability.title')}</Link>
        )}
        {user.role === 'caregiver' && (
          <Link className="quick-link" href={`/${locale}/care/identity`}><Icon name="user" /> {t('web.identity.title')}</Link>
        )}
        {user.role === 'caregiver' && (
          <Link className="quick-link" href={`/${locale}/care/payouts`}><Icon name="shield" /> {t('web.payouts.title')}</Link>
        )}
      </nav>

      <Card>
        <div className="household">
          <span className="household-icon" aria-hidden="true"><Icon name="shield" /></span>
          <div className="n-stack" style={{ ['--gap' as string]: '6px' }}>
            <div className="approval-top">
              <h2 className="card-title">{t('mfa.title')}</h2>
              <Badge tone={user.mfaEnabled ? 'ok' : 'neutral'}>{t(user.mfaEnabled ? 'mfa.statusOn' : 'mfa.statusOff')}</Badge>
            </div>
            <p className="n-muted">{t('mfa.intro')}</p>
            <Link className={buttonClass('quiet')} href={`/${locale}/account/security`}>{t('mfa.manage')}</Link>
          </div>
        </div>
      </Card>

      <SignOutButtons locale={locale} />
    </div>
  );
}
