import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { isKnownMunicipality, searchMunicipalities } from '../lib/municipalities';

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
}

/**
 * Sökbar kommunväljare.
 *
 * Fältet går att skriva i fritt (en ny kommun ska inte kunna blockera ett
 * kontoskapande), men listan föreslår Sveriges kommuner med län och går att
 * styra med tangentbordet: piltangenter flyttar markeringen, Enter väljer och
 * Escape stänger listan.
 */
export const MunicipalityPicker: React.FC<Props> = ({
  value,
  onChange,
  id,
  label = 'Kommun',
  required = false,
  disabled = false,
  placeholder = 'Sök kommun, t.ex. Ronneby',
  hint,
}) => {
  const generatedId = useId();
  const inputId = id ?? `kommun-${generatedId}`;
  const listId = `${inputId}-lista`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fältet följer det sparade värdet när formuläret fylls på utifrån.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const results = useMemo(() => searchMunicipalities(open ? query : value, 8), [open, query, value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const choose = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      choose(results[active].name);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const unknown = query.trim().length > 2 && !isKnownMunicipality(query);

  return (
    <div className="field" ref={wrapRef}>
      <label htmlFor={inputId}>
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <div className="municipality-field">
        <MapPin size={16} aria-hidden />
        <input
          id={inputId}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${inputId}-opt-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="municipality-list" id={listId} role="listbox" aria-label="Kommuner">
          {results.map((row, index) => (
            <li
              key={`${row.county}-${row.name}`}
              id={`${inputId}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'municipality-option active' : 'municipality-option'}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(row.name);
              }}
            >
              <strong>{row.name}</strong>
              <span>{row.county}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">
        {unknown ? 'Kommunen finns inte i listan – kontrollera stavningen.' : (hint ?? 'Sök eller skriv kommunens namn.')}
      </p>
    </div>
  );
};
