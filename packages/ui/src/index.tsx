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

type Variant = 'primary' | 'secondary' | 'quiet';
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
