import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';

const FILTERS = ['review', 'approved', 'rejected', 'all'] as const;
type Filter = (typeof FILTERS)[number];

interface Row {
  id: number; name: string; email: string; status: string; createdAt: string; divisions: Array<'kids' | 'pets'>;
  profileComplete: boolean; passed: number; total: number; approved: boolean; anyFailed: boolean;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.caregivers.title') };
}

export default async function CaregiversPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ filter?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'caregivers.read');
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'review';
  const data = (await apiGet<{ caregivers: Row[] }>(`/v1/admin/caregivers?filter=${filter}`, locale)).body;
  const rows = data?.caregivers ?? [];
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeZone: 'America/New_York' });

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="admin-h1">{t('admin.caregivers.title')}</h1>
      <nav className="admin-tabs" aria-label={t('admin.caregivers.title')}>
        {FILTERS.map((f) => (
          <Link key={f} href={`/${locale}/caregivers?filter=${f}`} aria-current={f === filter ? 'page' : undefined}>{t(`admin.caregivers.filters.${f}`)}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="n-muted">{t('admin.caregivers.empty')}</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.caregivers.colName')}</th><th>{t('admin.caregivers.colDivisions')}</th><th>{t('admin.caregivers.colProfile')}</th>
                <th>{t('admin.caregivers.colProgress')}</th><th>{t('admin.caregivers.colJoined')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/${locale}/caregivers/${r.id}`} className="row-link"><strong>{r.name}</strong><small>{r.email}</small></Link></td>
                  <td>{r.divisions.map((d) => t(`divisions.${d}`)).join(', ')}</td>
                  <td><Badge tone={r.profileComplete ? 'ok' : 'pending'}>{t(r.profileComplete ? 'admin.caregivers.profileComplete' : 'admin.caregivers.profileIncomplete')}</Badge></td>
                  <td>
                    {r.approved ? <Badge tone="ok">{t('admin.caregivers.approved')}</Badge>
                      : r.anyFailed ? <Badge tone="danger">{t('admin.caregivers.notApproved')}</Badge>
                      : <span className="mini-progress" aria-label={`${r.passed}/${r.total}`}><span style={{ width: `${(r.passed / r.total) * 100}%` }} /><b>{r.passed}/{r.total}</b></span>}
                  </td>
                  <td className="num">{date.format(new Date(r.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
