'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LANGUAGES } from '@nuriva/domain';
import { t, type Locale } from '@nuriva/i18n';

/** Language and sort controls; they update the URL so results are shareable and work with back/forward. */
export function SearchFilters({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="filter-row">
      <label className="mini-field" htmlFor="f-lang">
        <span>{t(locale, 'web.search.language')}</span>
        <select id="f-lang" className="n-input" value={params.get('language') ?? ''} onChange={(e) => set('language', e.target.value)}>
          <option value="">{t(locale, 'web.search.anyLanguage')}</option>
          {LANGUAGES.map((l) => <option key={l} value={l}>{t(locale, `web.care.languageNames.${l}`)}</option>)}
        </select>
      </label>
      <label className="mini-field" htmlFor="f-sort">
        <span>{t(locale, 'web.search.sort')}</span>
        <select id="f-sort" className="n-input" value={params.get('sort') ?? 'recommended'} onChange={(e) => set('sort', e.target.value === 'recommended' ? '' : e.target.value)}>
          <option value="recommended">{t(locale, 'web.search.sortRecommended')}</option>
          <option value="rate">{t(locale, 'web.search.sortRate')}</option>
          <option value="experience">{t(locale, 'web.search.sortExperience')}</option>
        </select>
      </label>
    </div>
  );
}
