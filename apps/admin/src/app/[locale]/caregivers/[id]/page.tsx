import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Card } from '@nuriva/ui';
import type { CaregiverProfileView, StepStatus, VettingStep } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { can, requirePermission } from '@/lib/staff';
import { VettingPanel } from '@/components/VettingPanel';
import { ScreeningHistory } from '@/components/ScreeningHistory';

interface Detail {
  caregiver: { id: number; name: string; email: string; status: string };
  profile: CaregiverProfileView;
  gaps: string[];
  steps: Array<{ step: VettingStep; status: StepStatus }>;
  identityCheck: { status: string; sessionId: string | null } | null;
}

export const metadata: Metadata = { robots: { index: false } };

export default async function CaregiverDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await resolveLocale(params.then((p) => ({ locale: p.locale })));
  const { id } = await params;
  const t = translator(locale);
  const staff = await requirePermission(locale, 'caregivers.read');
  if (!/^\d+$/.test(id)) notFound();
  const res = await apiGet<Detail>(`/v1/admin/caregivers/${id}`, locale);
  if (!res.body) notFound();
  const { caregiver, profile, gaps, steps, identityCheck } = res.body;
  const p = profile;

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '20px' }}>
      <Link href={`/${locale}/caregivers`} className="back-link">← {t('admin.detail.back')}</Link>
      <h1 className="admin-h1">{caregiver.name}</h1>
      <div className="detail-grid">
        <Card>
          <div className="n-stack">
            <h2 className="admin-h2">{t('admin.detail.profile')}</h2>
            <dl className="kv">
              <dt>{t('admin.detail.email')}</dt><dd>{caregiver.email}</dd>
              <dt>{t('admin.caregivers.colDivisions')}</dt><dd>{p.divisions.map((d) => t(`divisions.${d}`)).join(', ')}</dd>
              <dt>{t('admin.detail.rate')}</dt><dd>${(p.hourlyRateCents / 100).toFixed(2)}/h</dd>
              <dt>{t('admin.detail.years')}</dt><dd>{t('admin.detail.yearsValue', { n: p.yearsExperience })}</dd>
              <dt>{t('admin.detail.languages')}</dt><dd>{p.languages.map((l) => t(`web.care.languageNames.${l as 'en'}`)).join(', ')}</dd>
              <dt>{t('admin.detail.services')}</dt><dd>{p.services.map((s) => t(`services.${s as 'occasional'}`)).join(', ')}</dd>
              <dt>{t('admin.detail.zip')}</dt><dd>{p.zip ?? '—'}</dd>
              <dt>{t('admin.detail.headline')}</dt><dd>{p.headline || '—'}</dd>
              <dt>{t('admin.detail.bio')}</dt><dd className="bio">{p.bio || '—'}</dd>
            </dl>
            {gaps.length > 0 && (
              <p className="n-error">{t('admin.detail.missing')}: {gaps.map((g) => t(`web.care.gaps.${g as 'bio'}`)).join(' · ')}</p>
            )}
          </div>
        </Card>
        <div className="n-stack" style={{ ['--gap' as string]: '20px' }}>
          <VettingPanel
            locale={locale}
            caregiverId={caregiver.id}
            initialSteps={steps}
            canWrite={can(staff, 'caregivers.vetting.write')}
            canBackground={can(staff, 'screening.read')}
            identityCheck={identityCheck}
          />
          {can(staff, 'screening.read') && <ScreeningHistory locale={locale} caregiverId={caregiver.id} />}
        </div>
      </div>
    </div>
  );
}
