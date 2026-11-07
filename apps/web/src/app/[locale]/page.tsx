import Link from 'next/link';
import { ArtKids, ArtPets, CheckItem, Icon, buttonClass, type IconName } from '@nuriva/ui';
import { VETTING_STEPS } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const signedIn = !!me.body?.user;
  // Search is not built yet (Phase 3): tiles lead to the division details below.
  const tileHref = (d: 'kids' | 'pets') => `/${locale}#${d}`;

  const steps: Array<{ icon: IconName; title: string; body: string }> = [
    { icon: 'heart', title: t('web.home.step1Title'), body: t('web.home.step1Body') },
    { icon: 'search', title: t('web.home.step2Title'), body: t('web.home.step2Body') },
    { icon: 'chat', title: t('web.home.step3Title'), body: t('web.home.step3Body') },
  ];

  return (
    <>
      <section className="hero">
        <div className="n-container hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow"><Icon name="pin" size={16} /> {t('web.home.eyebrow')}</span>
            <h1>{t('web.home.title')}</h1>
            <p className="hero-sub">{t('web.home.subtitle')}</p>
            {!signedIn && (
              <div className="n-row">
                <Link className={buttonClass('sand')} href={`/${locale}/signup?role=client`}>{t('web.home.ctaFamily')}</Link>
                <Link className={`${buttonClass('secondary')} hero-ghost`} href={`/${locale}/signup?role=caregiver`}>{t('web.home.ctaCaregiver')}</Link>
              </div>
            )}
          </div>

          <div className="hero-panel">
            <p className="hero-need">{t('web.home.need')}</p>
            <div className="n-tiles">
              <Link href={tileHref('kids')} className="n-tile n-tile-kids">
                <ArtKids />
                <span>
                  <span className="n-tile-title">{t('web.home.tileKids')}<span className="n-tile-go"><Icon name="arrow" size={18} /></span></span>
                  <span className="n-tile-sub">{t('web.home.tileKidsSub')}</span>
                </span>
              </Link>
              <Link href={tileHref('pets')} className="n-tile n-tile-pets">
                <ArtPets />
                <span>
                  <span className="n-tile-title">{t('web.home.tilePets')}<span className="n-tile-go"><Icon name="arrow" size={18} /></span></span>
                  <span className="n-tile-sub">{t('web.home.tilePetsSub')}</span>
                </span>
              </Link>
            </div>
            <a href="#trust" className="checks-pill"><Icon name="shield" size={18} /> {t('web.home.checksBadge')}</a>
          </div>
        </div>
      </section>

      <section className="n-container section divisions">
        <article id="kids" className="division division-kids">
          <div className="division-art"><ArtKids /></div>
          <h2>{t('web.home.kidsTitle')}</h2>
          <p>{t('web.home.kidsBody')}</p>
          <ul className="n-chips">
            {(['occasional', 'scheduled', 'nanny', 'school_pickup', 'date_night'] as const).map((s) => <li key={s} className="n-chip">{t(`services.${s}`)}</li>)}
          </ul>
        </article>
        <article id="pets" className="division division-pets">
          <div className="division-art"><ArtPets /></div>
          <h2>{t('web.home.petsTitle')}</h2>
          <p>{t('web.home.petsBody')}</p>
          <ul className="n-chips">
            {(['dog_walking', 'drop_in', 'pet_sitting', 'overnight', 'puppy_care'] as const).map((s) => <li key={s} className="n-chip">{t(`services.${s}`)}</li>)}
          </ul>
        </article>
      </section>

      <section id="how" className="n-container section">
        <span className="n-eyebrow">{t('web.home.chooseYou')}</span>
        <h2 className="section-title">{t('web.home.howTitle')}</h2>
        <ol className="how-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="how-icon" aria-hidden="true"><Icon name={s.icon} /><span className="how-num">{i + 1}</span></span>
              <h3>{s.title}</h3>
              <p className="n-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="trust" className="n-container section">
        <div className="n-trust">
          <div className="n-trust-head">
            <span className="n-trust-shield"><Icon name="shield" size={26} /></span>
            <h2 className="trust-title">{t('web.home.trustTitle')}</h2>
          </div>
          <ul className="n-trust-list">
            {VETTING_STEPS.map((s) => <CheckItem key={s}>{t(`vetting.steps.${s}`)}</CheckItem>)}
          </ul>
          <p className="n-trust-note">{t('safety.disclaimer')}</p>
        </div>
      </section>

      {!signedIn && (
        <section className="n-container section soon">
          <div className="soon-card">
            <p>{t('web.home.comingSoon')}</p>
            <Link className={buttonClass('primary')} href={`/${locale}/signup?role=client`}>{t('auth.createAccount')}</Link>
          </div>
        </section>
      )}
    </>
  );
}
