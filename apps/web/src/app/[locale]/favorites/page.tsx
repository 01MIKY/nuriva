import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { buttonClass } from '@nuriva/ui';
import { formatMoney } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { avatarTint } from '@/lib/search';
import { RemoveFavorite } from '@/components/RemoveFavorite';

interface Favorite { id: string; displayName: string; initials: string; available: boolean; headline?: string; hourlyRateCents?: number; yearsExperience?: number }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.favorites.title'), robots: { index: false } };
}

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  if (user.role !== 'client') redirect(`/${locale}/account`);
  const list = (await apiGet<{ favorites: Favorite[] }>('/v1/favorites', locale)).body?.favorites ?? [];

  return (
    <div className="n-container account">
      <h1>{t('web.favorites.title')}</h1>
      <p className="n-muted">{t('web.favorites.intro')}</p>
      {list.length === 0 ? (
        <div className="n-card n-stack empty-state">
          <p>{t('web.favorites.empty')}</p>
          <Link className={buttonClass('primary')} href={`/${locale}/search?division=kids`}>{t('web.favorites.findCta')}</Link>
        </div>
      ) : (
        <ul className="fav-list">
          {list.map((f) => (
            <li key={f.id} className="n-card fav-card">
              <span className="cg-avatar" style={{ background: avatarTint(f.id) }} aria-hidden="true">{f.initials}</span>
              <div className="fav-body">
                <strong>{f.displayName}</strong>
                {f.available
                  ? <span className="n-muted">{f.headline} · {formatMoney(locale, f.hourlyRateCents ?? 0).replace(/\.00$/, '')}{t('web.search.perHour')}</span>
                  : <span className="n-muted">{t('web.favorites.unavailable')}</span>}
              </div>
              <div className="fav-actions">
                {f.available && <Link className={buttonClass('primary')} href={`/${locale}/book/${f.id}`}>{t('web.favorites.book')}</Link>}
                {f.available && <Link className={buttonClass('quiet')} href={`/${locale}/caregivers/${f.id}`}>{t('web.favorites.viewProfile')}</Link>}
                <RemoveFavorite locale={locale} caregiverId={f.id} label={t('web.favorites.remove')} name={f.displayName} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
