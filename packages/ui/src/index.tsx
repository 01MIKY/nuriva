import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** The NURIVA mark: a protective arch (home + embrace, the "n") over the one being cared for. */
export function LogoMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? '#F5F2EC' : '#172A43';
  const arch = inverted ? '#172A43' : '#E7BFA0';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d="M18 47V31a14 14 0 0 1 28 0v16" fill="none" stroke={arch} strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="32" cy="38" r="5.5" fill="#8FAE9D" />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="n-logo">
      <LogoMark size={size} />
      <span className="n-logo-word">NURIVA</span>
    </span>
  );
}

const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  pin: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg className="n-icon" viewBox="0 0 24 24" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {ICONS[name]}
    </svg>
  );
}

/** Division illustrations — brand shapes only (arch = care, circles = the people and pets cared for). */
export function ArtKids() {
  return (
    <svg className="n-art" viewBox="0 0 160 84" aria-hidden="true">
      <path d="M30 84V44a30 30 0 0 1 60 0v40" fill="none" stroke="#E7BFA0" strokeWidth="14" strokeLinecap="round" />
      <circle cx="60" cy="56" r="13" fill="#172A43" />
      <circle cx="110" cy="40" r="11" fill="#9A5B34" />
      <path d="M96 84c0-14 6-24 14-24s14 10 14 24z" fill="#9A5B34" />
      <circle cx="138" cy="58" r="7" fill="#8FAE9D" />
      <path d="M130 84c0-9 4-15 8-15s8 6 8 15z" fill="#8FAE9D" />
    </svg>
  );
}

export function ArtPets() {
  return (
    <svg className="n-art" viewBox="0 0 160 84" aria-hidden="true">
      <g fill="#4A6B5B"><ellipse cx="52" cy="58" rx="16" ry="13" /><circle cx="34" cy="38" r="7" /><circle cx="46" cy="28" r="7" /><circle cx="60" cy="28" r="7" /><circle cx="72" cy="38" r="7" /></g>
      <g fill="#8FAE9D"><ellipse cx="116" cy="40" rx="11" ry="9" /><circle cx="104" cy="26" r="5" /><circle cx="112" cy="19" r="5" /><circle cx="122" cy="19" r="5" /><circle cx="130" cy="26" r="5" /></g>
      <path d="M96 74c14-8 34-8 50 0" fill="none" stroke="#172A43" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** Check list item with the round "verified" mark. */
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li>
      <span className="n-okdot" aria-hidden="true"><Icon name="check" size={14} /></span>
      <span>{children}</span>
    </li>
  );
}

type Variant = 'primary' | 'secondary' | 'quiet' | 'sand';
export const buttonClass = (variant: Variant = 'primary', block = false) => cx('n-btn', `n-btn-${variant}`, block && 'n-btn-block');

export function Button({ variant = 'primary', block = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return <button className={cx(buttonClass(variant, block), className)} {...rest} />;
}

export function Field({ label, hint, error, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="n-field">
      <label className="n-label" htmlFor={id}>{label}</label>
      <input id={id} className="n-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && !error && <span id={`${id}-hint`} className="n-hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="n-error" role="alert">{error}</span>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('n-card', className)}>{children}</div>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return <div className={cx('n-alert', `n-alert-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export type BadgeTone = 'ok' | 'pending' | 'neutral' | 'danger';
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx('n-badge', `n-badge-${tone}`)}>{children}</span>;
}

export type StepStatus = 'not_started' | 'pending' | 'passed' | 'failed';
const statusTone: Record<StepStatus, BadgeTone> = { not_started: 'neutral', pending: 'pending', passed: 'ok', failed: 'danger' };

/** Vertical progress list, e.g. the caregiver approval tracker. Labels come from the caller (translated). */
export function StepList({ steps }: { steps: Array<{ key: string; label: string; status: StepStatus; statusLabel: string }> }) {
  return (
    <ol className="n-steps">
      {steps.map((s, i) => (
        <li key={s.key} className="n-step" data-status={s.status}>
          <span className="n-step-dot" aria-hidden="true">{s.status === 'passed' ? '✓' : s.status === 'failed' ? '✕' : i + 1}</span>
          <span>{s.label}</span>
          <Badge tone={statusTone[s.status]}>{s.statusLabel}</Badge>
        </li>
      ))}
    </ol>
  );
}
