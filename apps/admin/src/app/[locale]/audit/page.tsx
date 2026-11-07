import Link from 'next/link';
import type { Metadata } from 'next';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';

interface Entry { id: number; actor: string | null; action: string; target: string | null; meta: Record<string, unknown>; createdAt: string }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.audit.title') };
}

export default async function AuditPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ before?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'audit.read');
  const { before } = await searchParams;
  const q = before && /^\d+$/.test(before) ? `?before=${before}` : '';
  const entries = (await apiGet<{ entries: Entry[] }>(`/v1/admin/audit${q}`, locale)).body?.entries ?? [];
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/New_York' });

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="admin-h1">{t('admin.audit.title')}</h1>
      <p className="n-muted">{t('admin.audit.intro')}</p>
      {entries.length === 0 ? <p>{t('admin.audit.empty')}</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>{t('admin.audit.when')}</th><th>{t('admin.audit.actor')}</th><th>{t('admin.audit.action')}</th><th>{t('admin.audit.target')}</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="num">{date.format(new Date(e.createdAt))}</td>
                  <td>{e.actor ?? t('admin.audit.system')}</td>
                  <td><code>{e.action}</code></td>
                  <td><code>{e.target ?? '—'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === 100 && <Link className="back-link" href={`/${locale}/audit?before=${entries[entries.length - 1]!.id}`}>{t('admin.audit.older')} →</Link>}
    </div>
  );
}
