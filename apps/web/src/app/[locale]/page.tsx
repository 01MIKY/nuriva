import Link from 'next/link';
import { buttonClass } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);

  const steps = [
    { title: t('web.home.step1Title'), body: t('web.home.step1Body') },
    { title: t('web.home.step2Title'), body: t('web.home.step2Body') },
    { title: t('web.home.step3Title'), body: t('web.home.step3Body') },
  ];
  const checks = [t('web.home.trust1'), t('web.home.trust2'), t('web.home.trust3'), t('web.home.trust4')];

  return (
    <>
      <section className="hero">
        <div className="n-container hero-inner">
          <div className="hero-copy">
            <span className="n-eyebrow hero-eyebrow">{t('web.home.eyebrow')}</span>
            <h1>{t('web.home.title')}</h1>
            <p className="hero-sub">{t('web.home.subtitle')}</p>
            <div className="n-row">
              <Link className={buttonClass('primary')} href={`/${locale}/signup?role=client`}>{t('web.home.ctaFamily')}</Link>
              <Link className={buttonClass('secondary')} href={`/${locale}/signup?role=caregiver`}>{t('web.home.ctaCaregiver')}</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg viewBox="0 0 320 300" role="presentation">
              <path d="M60 280V150a100 100 0 0 1 200 0v130" fill="none" stroke="var(--n-sand)" strokeWidth="34" strokeLinecap="round" />
              <circle cx="160" cy="198" r="38" fill="var(--n-sage)" />
              <circle cx="232" cy="250" r="16" fill="var(--n-sand)" opacity="0.7" />
            </svg>
          </div>
        </div>
      </section>

      <section className="n-container section divisions">
        <article id="kids" className="division division-kids">
          <span className="n-eyebrow">{t('web.nav.kids')}</span>
          <h2>{t('web.home.kidsTitle')}</h2>
          <p>{t('web.home.kidsBody')}</p>
          <ul className="service-list">
            {(['occasional', 'scheduled', 'nanny', 'school_pickup'] as const).map((s) => <li key={s}>{t(`services.${s}`)}</li>)}
          </ul>
        </article>
        <article id="pets" className="division division-pets">
          <span className="n-eyebrow">{t('web.nav.pets')}</span>
          <h2>{t('web.home.petsTitle')}</h2>
          <p>{t('web.home.petsBody')}</p>
          <ul className="service-list">
            {(['dog_walking', 'drop_in', 'pet_sitting', 'overnight'] as const).map((s) => <li key={s}>{t(`services.${s}`)}</li>)}
          </ul>
        </article>
      </section>

      <section id="how" className="n-container section">
        <h2 className="section-title">{t('web.home.howTitle')}</h2>
        <ol className="how-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="how-num" aria-hidden="true">{i + 1}</span>
              <h3>{s.title}</h3>
              <p className="n-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="trust-band">
        <div className="n-container section trust-inner">
          <h2>{t('web.home.trustTitle')}</h2>
          <ul className="trust-list">
            {checks.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p className="trust-note">{t('safety.disclaimer')}</p>
        </div>
      </section>

      <section className="n-container section soon">
        <p>{t('web.home.comingSoon')}</p>
        <Link className={buttonClass('primary')} href={`/${locale}/signup?role=client`}>{t('auth.createAccount')}</Link>
      </section>
    </>
  );
}
