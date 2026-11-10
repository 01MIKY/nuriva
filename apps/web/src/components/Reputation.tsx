import type { Badge } from '@nuriva/domain';
import type { MessageKey } from '@nuriva/i18n';

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

export function badgeLabel(t: T, b: Badge) {
  return b.key === 'repeatFamilies' ? t('web.reputation.badges.repeatFamilies', { n: b.n }) : t(`web.reputation.badges.${b.key}`);
}

/** Silver/Gold pill (nothing for the starting level). Facts only — never a safety claim. */
export function LevelPill({ t, level }: { t: T; level: 'silver' | 'gold' | null }) {
  if (!level) return null;
  return <span className={`lvl-pill ${level}`}>{level === 'gold' ? '★★' : '★'} {t('web.reputation.levelBadge', { level: t(`web.reputation.levels.${level}`) })}</span>;
}

export function BadgeList({ t, badges, max }: { t: T; badges: Badge[]; max?: number }) {
  const shown = max ? badges.slice(0, max) : badges;
  return <>{shown.map((b) => <span key={b.key} className="n-badge n-badge-neutral rep-badge">{badgeLabel(t, b)}</span>)}</>;
}

export interface OwnReputation {
  stats: { completed: number; ratingAvg: number | null; ratingCount: number; repeatFamilies: number };
  level: 'new' | 'silver' | 'gold';
  next: 'silver' | 'gold' | null;
  missing: Array<{ key: 'completed' | 'reviews' | 'rating' | 'repeatFamilies' | 'reliability'; need: number }>;
  badges: Badge[];
}

/** The caregiver's own level, stats and what is missing for the next one. Informational only. */
export function LevelCard({ t, locale, data }: { t: T; locale: string; data: OwnReputation }) {
  const s = data.stats;
  return (
    <section className="n-card n-stack level-card" aria-labelledby="level-h" style={{ ['--gap' as string]: '12px' }}>
      <div className="approval-top">
        <h2 id="level-h" className="card-title">{t('web.reputation.yourLevel')}</h2>
        <span className={`lvl-pill ${data.level}`}>{data.level === 'gold' ? '★★' : data.level === 'silver' ? '★' : '○'} {t(`web.reputation.levels.${data.level}`)}</span>
      </div>
      <dl className="level-stats">
        <div><dt>{t('web.reputation.statCompleted')}</dt><dd>{s.completed}</dd></div>
        <div><dt>{t('web.reputation.statRating')}</dt><dd>{s.ratingAvg !== null ? `★ ${s.ratingAvg.toLocaleString(locale)} (${s.ratingCount})` : t('web.reputation.noRating')}</dd></div>
        <div><dt>{t('web.reputation.statRepeat')}</dt><dd>{s.repeatFamilies}</dd></div>
      </dl>
      {data.badges.length > 0 && <span className="cg-badges"><BadgeList t={t} badges={data.badges} /></span>}
      {data.next ? (
        <div className="n-stack" style={{ ['--gap' as string]: '6px' }}>
          <strong>{t('web.reputation.nextLevel', { level: t(`web.reputation.levels.${data.next}`) })}</strong>
          <ul className="level-missing">
            {data.missing.map((m) => (
              <li key={m.key}>{t(`web.reputation.missing.${m.key}`, { n: m.key === 'rating' ? m.need.toLocaleString(locale) : m.need })}</li>
            ))}
          </ul>
        </div>
      ) : <p>{t('web.reputation.top')}</p>}
      <p className="n-hint">{t('web.reputation.info')}</p>
    </section>
  );
}
