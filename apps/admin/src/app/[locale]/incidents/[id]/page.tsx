import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Badge, Card, type BadgeTone } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';
import { IncidentStatusForm } from '@/components/IncidentStatusForm';

type Sev = 'low' | 'medium' | 'high' | 'emergency';
const SEV_TONE: Record<Sev, BadgeTone> = { low: 'neutral', medium: 'pending', high: 'danger', emergency: 'danger' };
interface Detail {
  id: number; bookingId: number; severity: Sev; status: 'open' | 'investigating' | 'resolved'; createdAt: string;
  reporter: { name: string; role: 'client' | 'caregiver' | 'admin' }; description: string; resolution: string | null;
}

export const metadata: Metadata = { robots: { index: false } };

export default async function IncidentDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'incidents.manage');
  if (!/^\d+$/.test(id)) notFound();
  const i = (await apiGet<{ incident: Detail }>(`/v1/admin/incidents/${id}`, locale)).body?.incident;
  if (!i) notFound();
  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px', maxWidth: '760px' }}>
      <Link href={`/${locale}/incidents`} className="back-link">← {t('admin.incidents.title')}</Link>
      <div className="n-row">
        <h1 className="admin-h1">#{i.id}</h1>
        <Badge tone={SEV_TONE[i.severity]}>{t(`admin.incidents.severity.${i.severity}`)}</Badge>
        <Badge>{t(`admin.incidents.status.${i.status}`)}</Badge>
      </div>
      <p className="n-muted">{t('admin.incidents.booking', { id: i.bookingId })} · {t('admin.incidents.reportedBy', { role: `${i.reporter.name} (${t(`admin.incidents.roles.${i.reporter.role}`)})` })}</p>
      <Card className="restricted-card">
        <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
          <h2 className="admin-h2">{t('admin.incidents.description')}</h2>
          <p className="bio">{i.description}</p>
          {i.resolution && <><h2 className="admin-h2">{t('admin.incidents.resolution')}</h2><p className="bio">{i.resolution}</p></>}
          <small className="n-muted">{t('admin.incidents.restricted')}</small>
        </div>
      </Card>
      <IncidentStatusForm locale={locale} id={i.id} status={i.status} />
    </div>
  );
}
