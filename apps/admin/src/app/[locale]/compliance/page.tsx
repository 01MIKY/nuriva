import type { Metadata } from 'next';
import { SERVICES, COUNSEL_REVIEW_SERVICES, DIVISIONS } from '@nuriva/domain';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { can, requirePermission } from '@/lib/staff';
import { ComplianceRow, type Activation } from '@/components/ComplianceRow';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.compliance.title') };
}

export default async function CompliancePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const staff = await requirePermission(locale, 'caregivers.read');
  const data = (await apiGet<{ activations: Activation[] }>('/v1/admin/compliance/services', locale)).body;
  // API returns newest first: the first row per service is its current state.
  const latest = new Map<string, Activation>();
  for (const a of data?.activations ?? []) if (!latest.has(`${a.division}.${a.service}`)) latest.set(`${a.division}.${a.service}`, a);
  const canChange = can(staff, 'compliance.activate_service');

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="admin-h1">{t('admin.compliance.title')}</h1>
      <p className="n-muted" style={{ maxWidth: '70ch' }}>{t('admin.compliance.intro')}</p>
      {!canChange && <p className="n-hint">{t('admin.compliance.onlySuper')}</p>}
      {DIVISIONS.map((division) => (
        <section key={division} className="n-stack" style={{ ['--gap' as string]: '8px' }} aria-label={t(`divisions.${division}`)}>
          <h2 className="admin-h2">{t(`divisions.${division}`)}</h2>
          <ul className="comp-list">
            {SERVICES[division].map((service) => (
              <ComplianceRow
                key={service}
                locale={locale}
                division={division}
                service={service}
                current={latest.get(`${division}.${service}`) ?? null}
                counsel={COUNSEL_REVIEW_SERVICES.some((c) => c.division === division && c.service === service)}
                canChange={canChange}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
