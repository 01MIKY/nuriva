import Link from 'next/link';
import { buttonClass } from '@nuriva/ui';
import { formatMoney, type Locale } from '@nuriva/i18n';
import { translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { avatarTint } from '@/lib/search';
import type { BookingView } from '@/lib/bookings';

interface Alternative { id: string; displayName: string; initials: string; headline: string; hourlyRateCents: number; yearsExperience: number; rating: { avg: number; count: number } | null }

/**
 * Backup guarantee (family view): shown when the caregiver declined or cancelled a visit that has not started.
 * Lists verified caregivers free at the same time; booking one copies every detail, including the time.
 */
export async function BackupPanel({ locale, booking }: { locale: Locale; booking: BookingView }) {
  const t = translator(locale);
  const list = (await apiGet<{ alternatives: Alternative[] }>(`/v1/bookings/${booking.id}/alternatives`, locale)).body?.alternatives ?? [];
  const paid = booking.payment.paidCents > 0;
  return (
    <section className="n-card n-stack backup-card" aria-labelledby="backup-h" style={{ ['--gap' as string]: '12px' }}>
      <h2 id="backup-h" className="card-title">🛟 {t('web.backup.title')}</h2>
      <p>{t('web.backup.sorry', { name: booking.caregiver.displayName })} {t(paid ? 'web.backup.refunded' : 'web.backup.noCharge')}</p>
      {list.length === 0 ? (
        <>
          <p className="n-muted">{t('web.backup.none')}</p>
          <Link className={buttonClass('quiet')} href={`/${locale}/search?division=${booking.division}`}>{t('web.backup.searchOther')}</Link>
        </>
      ) : (
        <>
          <p className="n-muted">{t('web.backup.intro')}</p>
          <ul className="fav-list">
            {list.map((a) => (
              <li key={a.id} className="fav-card backup-option">
                <span className="cg-avatar" style={{ background: avatarTint(a.id) }} aria-hidden="true">{a.initials}</span>
                <div className="fav-body">
                  <strong>{a.displayName}{a.rating ? ` · ★ ${a.rating.avg.toLocaleString(locale)}` : ''}</strong>
                  <span className="n-muted">{a.headline} · {formatMoney(locale, a.hourlyRateCents).replace(/\.00$/, '')}{t('web.search.perHour')}</span>
                </div>
                <Link className={buttonClass('primary')} href={`/${locale}/book/${a.id}?again=${booking.id}&sameTime=1`}>{t('web.backup.bookSameTime')}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
