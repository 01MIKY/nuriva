import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckItem, Icon, buttonClass } from '@nuriva/ui';
import { formatMoney, type MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { avatarTint, type PublicProfile } from '@/lib/search';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadFull(id: string, locale: 'en' | 'es') {
  if (!UUID.test(id)) return null;
  return (await apiGet<{ caregiver: PublicProfile; bookingsEnabled: boolean; paymentsEnabled?: boolean }>(`/v1/caregivers/${id}`, locale)).body ?? null;
}
const load = async (id: string, locale: 'en' | 'es') => (await loadFull(id, locale))?.caregiver ?? null;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const c = await load(id, locale);
  return { title: c ? `${c.displayName} · ${c.headline}` : translator(locale)('web.profile.notFound') };
}

export default async function CaregiverProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const [full, me] = await Promise.all([loadFull(id, locale), apiGet<Me>('/v1/auth/me', locale)]);
  if (!full) notFound();
  const c = full.caregiver;
  const user = me.body?.user ?? null;
  const since = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(c.memberSince));
  const firstDivision = c.divisions[0]!.division;

  return (
    <div className="n-container profile-page">
      <Link href={`/${locale}/search?division=${firstDivision}`} className="back-link">← {t('web.profile.back')}</Link>
      <div className="profile-grid">
        <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
          <section className={`profile-hero ${firstDivision}`}>
            <span className="cg-avatar big" style={{ background: avatarTint(c.id) }} aria-hidden="true">
              {c.initials}<span className="cg-check"><Icon name="check" size={14} /></span>
            </span>
            <h1>{c.displayName}</h1>
            <p className="profile-headline">{c.headline}</p>
            <p className="cg-meta">{t('web.search.years', { n: c.yearsExperience })} · {t('web.profile.memberSince', { date: since })}</p>
            <span className="n-badge n-badge-ok">✓ {t('web.search.verified')}</span>
          </section>

          <section className="n-card n-stack" aria-labelledby="about-h">
            <h2 id="about-h" className="card-title">{t('web.profile.about')}</h2>
            <p className="bio">{c.bio}</p>
          </section>

          <section className="n-card n-stack" aria-labelledby="svc-h">
            <h2 id="svc-h" className="card-title">{t('web.profile.services')}</h2>
            {c.divisions.map((d) => (
              <div key={d.division} className="n-stack" style={{ ['--gap' as string]: '6px' }}>
                <strong>{t(`divisions.${d.division}`)}</strong>
                <ul className="n-chips">{d.services.map((s) => <li key={s} className="n-chip">{t(`services.${s}` as MessageKey)}</li>)}</ul>
              </div>
            ))}
            <h3 className="card-title small">{t('web.profile.languages')}</h3>
            <p>{c.languages.map((l) => t(`web.care.languageNames.${l as 'en'}`)).join(', ')}</p>
          </section>

          <section className="n-card n-stack" aria-labelledby="checks-h">
            <h2 id="checks-h" className="card-title">{t('web.profile.checks')}</h2>
            <ul className="checks-list">{c.verifiedSteps.map((s) => <CheckItem key={s}>{t(`vetting.steps.${s as 'identity'}`)}</CheckItem>)}</ul>
            <p className="n-hint">{t('safety.disclaimer')}</p>
          </section>
        </div>

        <aside className="book-box" aria-label={t('web.profile.book')}>
          <span className="cg-price big">{formatMoney(locale, c.hourlyRateCents).replace(/\.00$/, '')}<small>{t('web.search.perHour')}</small></span>
          {!full.bookingsEnabled ? (
            <>
              <button type="button" className="n-btn n-btn-primary n-btn-block" disabled aria-describedby="book-soon">{t('web.profile.book')}</button>
              <p id="book-soon" className="n-hint">{t('web.profile.bookingSoon')}</p>
            </>
          ) : !user ? (
            <Link className={buttonClass('primary', true)} href={`/${locale}/signin`}>{t('web.book.signInToBook')}</Link>
          ) : user.role === 'client' ? (
            <>
              <Link className={buttonClass('primary', true)} href={`/${locale}/book/${c.id}`}>{t('web.profile.book')}</Link>
              <p className="n-hint">{t(full.paymentsEnabled ? 'web.pay.chargeAfterAccept' : 'web.book.noCharge')}</p>
            </>
          ) : (
            <p className="n-hint">{t('web.book.onlyFamilies')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
