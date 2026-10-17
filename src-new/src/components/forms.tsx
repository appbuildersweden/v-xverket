import React, { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Gemensamma formulärfält och en enkel dialog. Panelerna har många små formulär
 * — uppgifter, kort, meddelanden, planering — och de ska se likadana ut och
 * fungera med tangentbord och skärmläsare.
 */

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'search' | 'date' | 'number' | 'url';
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  required,
  maxLength,
  disabled,
  autoFocus,
}) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        aria-describedby={hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-hint field-hint-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  maxLength,
  required,
}) => {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={id}
        className="input textarea"
        value={value}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
};

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  hint?: string;
  disabled?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}) => {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Text på stängknappens tillgängliga namn. */
  closeLabel?: string;
}

/** Dialog som stängs med Escape, klick utanför eller stängknappen. */
export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  children,
  closeLabel = 'Stäng',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="modal">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="card-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  question?: string;
  onConfirm: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * Tvåstegsknapp för åtgärder som inte kan ångras (ta bort, koppla bort).
 * Första klicket frågar, andra klicket utför — inga webbläsardialoger behövs.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  label,
  confirmLabel = 'Bekräfta',
  question = 'Är du säker?',
  onConfirm,
  busy,
  className = 'btn btn-outline btn-sm',
}) => {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)} disabled={busy}>
        {label}
      </button>
    );
  }

  return (
    <span className="confirm-inline" role="group" aria-label={question}>
      <span className="muted">{question}</span>
      <button type="button" className="btn btn-sm btn-danger" onClick={onConfirm} disabled={busy}>
        {busy ? 'Arbetar…' : confirmLabel}
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setAsking(false)}>
        Avbryt
      </button>
    </span>
  );
};

interface FormActionsProps {
  busy?: boolean;
  submitLabel: string;
  onCancel: () => void;
  cancelLabel?: string;
}

export const FormActions: React.FC<FormActionsProps> = ({
  busy,
  submitLabel,
  onCancel,
  cancelLabel = 'Avbryt',
}) => (
  <div className="form-actions">
    <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
      {cancelLabel}
    </button>
    <button type="submit" className="btn btn-primary" disabled={busy}>
      {busy ? 'Sparar…' : submitLabel}
    </button>
  </div>
);
