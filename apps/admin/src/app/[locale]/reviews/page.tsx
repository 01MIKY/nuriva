import Link from 'next/link';
import type { Metadata } from 'next';
import { Alert } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet } from '@/lib/server-api';
import { requirePermission } from '@/lib/staff';
import { ReviewRow, type AdminReview } from '@/components/ReviewRow';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('admin.reviews.title') };
}

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ filter?: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  await requirePermission(locale, 'reviews.moderate');
  const filter = (await searchParams).filter === 'hidden' ? 'hidden' : 'all';
  const rows = (await apiGet<{ reviews: AdminReview[] }>(`/v1/admin/reviews?filter=${filter}`, locale)).body?.reviews ?? [];
  return (
    <div className="n-stack" style={{ ['--gap' as string]: '18px', maxWidth: '860px' }}>
      <h1 className="admin-h1">{t('admin.reviews.title')}</h1>
      <Alert>{t('admin.reviews.policy')}</Alert>
      <nav className="admin-tabs" aria-label={t('admin.reviews.title')}>
        {(['all', 'hidden'] as const).map((f) => <Link key={f} href={`/${locale}/reviews?filter=${f}`} aria-current={f === filter ? 'page' : undefined}>{t(`admin.reviews.filters.${f}`)}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="n-muted">{t('admin.reviews.empty')}</p> : (
        <ul className="comp-list">{rows.map((r) => <ReviewRow key={r.id} locale={locale} review={r} />)}</ul>
      )}
    </div>
  );
}
