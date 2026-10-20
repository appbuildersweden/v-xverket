import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Inbox, Loader2, Search, X } from 'lucide-react';
import { initials } from '../lib/format';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    loading?: boolean;
    icon?: React.ReactNode;
  }
> = ({ variant = 'primary', size = 'md', loading, icon, children, className = '', ...rest }) => (
  <button
    className={`btn btn-${variant} btn-${size} ${className}`.trim()}
    disabled={loading || rest.disabled}
    {...rest}
  >
    {loading ? <Loader2 size={16} className="spin" aria-hidden /> : icon}
    {children}
  </button>
);

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  id?: string;
}> = ({ children, className = '', title, subtitle, action, id }) => (
  <section className={`card ${className}`.trim()} id={id}>
    {(title || action) && (
      <div className="card-head">
        <div>
          {title && <h2 className="card-title">{title}</h2>}
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
}> = ({ children, tone = 'neutral' }) => <span className={`badge badge-${tone}`}>{children}</span>;

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, description, action, icon }) => (
  <div className="empty">
    <div className="empty-icon">{icon ?? <Inbox size={24} />}</div>
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action && <div className="empty-action">{action}</div>}
  </div>
);

export const Alert: React.FC<{
  children: React.ReactNode;
  tone?: 'error' | 'success' | 'info';
}> = ({ children, tone = 'error' }) => (
  <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
    <div>{children}</div>
  </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Laddar…' }) => (
  <div className="loading-block" role="status">
    <Loader2 size={22} className="spin" />
    <span>{label}</span>
  </div>
);

export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}> = ({ label, htmlFor, hint, error, children, required }) => (
  <div className="field">
    <label htmlFor={htmlFor}>
      {label}
      {required && <span className="req"> *</span>}
    </label>
    {children}
    {hint && !error && <p className="field-hint">{hint}</p>}
    {error && <p className="field-error">{error}</p>}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, title, onClose, children, footer, wide }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export const Avatar: React.FC<{ name: string; size?: number; src?: string | null }> = ({
  name,
  size = 42,
  src,
}) => (
  <span
    className="avatar"
    style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
    aria-hidden={!!src}
  >
    {src ? <img src={src} alt="" /> : initials(name)}
  </span>
);

export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'green' | 'amber' | 'red' | 'neutral';
}> = ({ label, value, hint, tone = 'neutral' }) => (
  <div className={`stat stat-${tone}`}>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    {hint && <span className="stat-hint">{hint}</span>}
  </div>
);

export const PageIntro: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <div className="page-intro">
    <div>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);

/** Sökfält med ikon. Samma utseende i alla sökbara vyer. */
export const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  id?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder, ariaLabel, id, autoFocus }) => (
  <div className="search-field">
    <Search size={16} aria-hidden />
    <input
      id={id}
      className="input"
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

/** Växlare mellan flikar/filter. Används i stället för egna knapprader. */
export const Segmented: React.FC<{
  options: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}> = ({ options, value, onChange, ariaLabel }) => (
  <div className="segmented" role="tablist" aria-label={ariaLabel}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        role="tab"
        aria-selected={value === option.id}
        className={value === option.id ? 'active' : undefined}
        onClick={() => onChange(option.id)}
      >
        {option.label}
        {typeof option.count === 'number' ? ` (${option.count})` : ''}
      </button>
    ))}
  </div>
);
