import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, type BadgeTone } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';

const FILTERS = ['open', 'investigating', 'resolved', 'all'] as const;
type Sev = 'low' | 'medium' | 'high' | 'emergency';
const SEV_TONE: Record<Sev, BadgeTone> = { low: 'neutral', medium: 'pending', high: 'danger', emergency: 'danger' };
interface Row { id: number; bookingId: number; severity: Sev; status: 'open' | 'investigating' | 'resolved'; createdAt: string; reporterRole: 'client' | 'caregiver' | 'admin' }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.incidents.title') };
}

export default async function IncidentsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'incidents.manage');
  const sp = await searchParams;
  const status = (FILTERS as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof FILTERS)[number]) : 'open';
  const rows = (await apiGet<{ incidents: Row[] }>(`/v1/admin/incidents?status=${status}`, locale)).body?.incidents ?? [];
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="admin-h1">{t('admin.incidents.title')}</h1>
      <nav className="admin-tabs" aria-label={t('admin.incidents.title')}>
        {FILTERS.map((f) => <Link key={f} href={`/${locale}/incidents?status=${f}`} aria-current={f === status ? 'page' : undefined}>{t(`admin.incidents.filters.${f}`)}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="n-muted">{t('admin.incidents.empty')}</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>#</th><th>{t('admin.incidents.update')}</th><th>{t('admin.audit.when')}</th><th>{t('admin.audit.target')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.severity === 'emergency' ? 'row-urgent' : undefined}>
                  <td><Link href={`/${locale}/incidents/${r.id}`} className="row-link"><strong>#{r.id}</strong></Link></td>
                  <td><span className="n-row" style={{ ['--gap' as string]: '6px' }}>
                    <Badge tone={SEV_TONE[r.severity]}>{t(`admin.incidents.severity.${r.severity}`)}</Badge>
                    <Badge>{t(`admin.incidents.status.${r.status}`)}</Badge>
                  </span></td>
                  <td className="num">{date.format(new Date(r.createdAt))}</td>
                  <td>{t('admin.incidents.booking', { id: r.bookingId })} · {t('admin.incidents.reportedBy', { role: t(`admin.incidents.roles.${r.reporterRole}`) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
