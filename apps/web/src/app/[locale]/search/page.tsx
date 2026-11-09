import Link from 'next/link';
import type { Metadata } from 'next';
import { Icon, buttonClass } from '@nuriva/ui';
import { LANGUAGES } from '@nuriva/domain';
import { formatMoney, type MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { avatarTint, type SearchResponse } from '@/lib/search';
import { SearchFilters } from '@/components/SearchFilters';

type SP = { division?: string; service?: string; language?: string; sort?: string };

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const t = translator(await resolveLocale(params));
  const { division } = await searchParams;
  return { title: t(division === 'pets' ? 'web.search.titlePets' : 'web.search.titleKids') };
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const sp = await searchParams;
  const division = sp.division === 'pets' ? 'pets' : 'kids';
  const language = (LANGUAGES as readonly string[]).includes(sp.language ?? '') ? sp.language : undefined;
  const sort = sp.sort === 'rate' || sp.sort === 'experience' ? sp.sort : undefined;

  const qs = new URLSearchParams({ division });
  if (sp.service && /^[a-z_]{3,30}$/.test(sp.service)) qs.set('service', sp.service);
  if (language) qs.set('language', language);
  if (sort) qs.set('sort', sort);
  const [res, me] = await Promise.all([apiGet<SearchResponse>(`/v1/caregivers/search?${qs}`, locale), apiGet<Me>('/v1/auth/me', locale)]);
  const data = res.body;
  const signedIn = !!me.body?.user;
  const results = data?.results ?? [];
  const available = data?.availableServices ?? [];
  const service = qs.get('service') && available.includes(qs.get('service')!) ? qs.get('service') : null;
  const filtered = !!(service || language);
  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams({ division });
    if (service) p.set('service', service);
    if (language) p.set('language', language);
    if (sort) p.set('sort', sort);
    for (const [k, v] of Object.entries(over)) { if (v) p.set(k, v); else p.delete(k); }
    return `/${locale}/search?${p}`;
  };

  return (
    <div className="n-container search-page">
      <div className="search-head">
        <div className="seg-links" role="tablist" aria-label={t('web.home.need')}>
          <Link href={`/${locale}/search?division=kids`} role="tab" aria-selected={division === 'kids'} className="seg-link kids">{t('web.home.tileKids')}</Link>
          <Link href={`/${locale}/search?division=pets`} role="tab" aria-selected={division === 'pets'} className="seg-link pets">{t('web.home.tilePets')}</Link>
        </div>
        <h1>{t(division === 'pets' ? 'web.search.titlePets' : 'web.search.titleKids')}</h1>
      </div>

      {available.length > 0 && (
        <nav className="toggle-chips" aria-label={t('web.care.services')}>
          <Link href={href({ service: null })} className="toggle-chip" aria-current={!service ? 'true' : undefined}>{t('web.search.allServices')}</Link>
          {available.map((s) => (
            <Link key={s} href={href({ service: s })} className="toggle-chip" aria-current={service === s ? 'true' : undefined}>{t(`services.${s}` as MessageKey)}</Link>
          ))}
        </nav>
      )}
      <SearchFilters locale={locale} />

      <p className="n-muted results-count" role="status">
        {results.length === 1 ? t('web.search.resultsOne') : t('web.search.results', { n: results.length })}
      </p>

      {results.length === 0 ? (
        <div className="empty-search">
          <span className={`household-icon ${division}`} aria-hidden="true"><Icon name="search" /></span>
          <h2 className="card-title">{filtered ? t('web.search.emptyFiltered') : t('web.search.emptyTitle')}</h2>
          {filtered
            ? <Link className={buttonClass('quiet')} href={`/${locale}/search?division=${division}`}>{t('web.search.clear')}</Link>
            : <><p className="n-muted">{t(signedIn ? 'web.search.emptyBodySignedIn' : 'web.search.emptyBody')}</p>
                {!signedIn && <Link className={buttonClass('primary')} href={`/${locale}/signup?role=client`}>{t('auth.createAccount')}</Link>}</>}
        </div>
      ) : (
        <ul className="cg-grid">
          {results.map((c) => (
            <li key={c.id}>
              <Link href={`/${locale}/caregivers/${c.id}`} className="cg-card" aria-label={`${t('web.search.viewProfile')}: ${c.displayName}`}>
                <span className="cg-avatar" style={{ background: avatarTint(c.id) }} aria-hidden="true">
                  {c.initials}<span className="cg-check"><Icon name="check" size={12} /></span>
                </span>
                <span className="cg-body">
                  <span className="cg-top">
                    <strong className="cg-name">{c.displayName}</strong>
                    <span className="cg-price">{formatMoney(locale, c.hourlyRateCents).replace(/\.00$/, '')}<small>{t('web.search.perHour')}</small></span>
                  </span>
                  <span className="cg-headline">{c.headline}</span>
                  <span className="cg-meta">{t('web.search.years', { n: c.yearsExperience })} · {c.languages.map((l) => t(`web.care.languageNames.${l as 'en'}`)).join(', ')}</span>
                  <span className="cg-badges">
                    <span className="n-badge n-badge-ok">✓ {t('web.search.verified')}</span>
                    {c.services.slice(0, 3).map((s) => <span key={s} className="n-badge n-badge-neutral">{t(`services.${s}` as MessageKey)}</span>)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="n-hint">{t('safety.disclaimer')}</p>
    </div>
  );
}
