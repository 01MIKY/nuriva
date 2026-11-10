import Link from 'next/link';
import type { Metadata } from 'next';
import { Alert } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';

const PERIODS = ['30', '90', '365'] as const;
interface Row { userId: number; name: string; role: 'client' | 'caregiver' | 'admin'; phone: number; email: number; link: number; payment: number; total: number; bookings: number; lastAt: string }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.offPlatform.title') };
}

/** Trust & Safety: counts of chat messages with off-platform signals per person (never the text). */
export default async function OffPlatformPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'incidents.manage');
  const sp = await searchParams;
  const days = (PERIODS as readonly string[]).includes(sp.days ?? '') ? sp.days! : '90';
  const rows = (await apiGet<{ people: Row[] }>(`/v1/admin/off-platform?days=${days}`, locale)).body?.people ?? [];
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeZone: 'America/New_York' });
  const n = (v: number) => (v > 0 ? <strong>{v}</strong> : <span className="n-muted">0</span>);
  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="admin-h1">{t('admin.offPlatform.title')}</h1>
      <p className="n-muted">{t('admin.offPlatform.intro')}</p>
      <Alert>{t('admin.offPlatform.caution')}</Alert>
      <nav className="admin-tabs" aria-label={t('admin.offPlatform.title')}>
        {PERIODS.map((p) => <Link key={p} href={`/${locale}/off-platform?days=${p}`} aria-current={p === days ? 'page' : undefined}>{t('admin.offPlatform.period', { n: p })}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="n-muted">{t('admin.offPlatform.empty')}</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>{t('admin.offPlatform.person')}</th><th>{t('admin.offPlatform.role')}</th>
              <th className="num">{t('admin.offPlatform.phone')}</th><th className="num">{t('admin.offPlatform.email')}</th>
              <th className="num">{t('admin.offPlatform.link')}</th><th className="num">{t('admin.offPlatform.payment')}</th>
              <th className="num">{t('admin.offPlatform.total')}</th><th className="num">{t('admin.offPlatform.bookings')}</th><th>{t('admin.offPlatform.last')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>{r.role === 'caregiver'
                    ? <Link href={`/${locale}/caregivers/${r.userId}`} className="row-link" aria-label={`${t('admin.offPlatform.openFile')}: ${r.name}`}><strong>{r.name}</strong></Link>
                    : <strong>{r.name}</strong>}</td>
                  <td>{t(`admin.offPlatform.roles.${r.role}`)}</td>
                  <td className="num">{n(r.phone)}</td><td className="num">{n(r.email)}</td><td className="num">{n(r.link)}</td><td className="num">{n(r.payment)}</td>
                  <td className="num"><strong>{r.total}</strong></td><td className="num">{r.bookings}</td>
                  <td className="num">{date.format(new Date(r.lastAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
