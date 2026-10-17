import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  WEEKDAY_LABELS,
  countByDay,
  dayAriaLabel,
  monthGrid,
  shiftMonth,
} from '../lib/calendar';
import { monthLabel, todayISO } from '../lib/dates';

interface Props {
  /** Poster med datum som ska visas i rutnätet. */
  items: ReadonlyArray<{ due_date: string | null }>;
  /** Valt datum (YYYY-MM-DD) eller null när alla dagar visas. */
  selected: string | null;
  onSelect: (iso: string | null) => void;
}

/**
 * Kalendern i Min planering. Visar en månad i taget med en siffra per dag för
 * hur många poster som ligger där, och låter eleven välja en dag för att filtrera
 * listorna. Datumen kommer från elevens egna poster och från uppgifter läraren
 * har gett — kalendern räknar ingenting själv och visar inga påhittade
 * aktiviteter.
 */
export const PlannerCalendar: React.FC<Props> = ({ items, selected, onSelect }) => {
  const today = todayISO();
  const [visible, setVisible] = useState(() => {
    const base = selected ?? today;
    const [year, month] = base.split('-').map(Number);
    return { year, month: month - 1 };
  });

  const days = useMemo(
    () => monthGrid(visible.year, visible.month, today),
    [visible.year, visible.month, today],
  );
  const counts = useMemo(() => countByDay(items), [items]);

  const step = (delta: number) => setVisible(shiftMonth(visible.year, visible.month, delta));
  const goToday = () => {
    const [year, month] = today.split('-').map(Number);
    setVisible({ year, month: month - 1 });
    onSelect(today);
  };

  return (
    <div className="calendar" data-testid="planner-calendar">
      <div className="calendar-head">
        <h3 className="calendar-title" data-testid="calendar-month">
          {monthLabel(visible.year, visible.month)}
        </h3>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => step(-1)}
            aria-label="Föregående månad"
          >
            <ChevronLeft size={15} />
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={goToday}>
            <CalendarDays size={15} /> Idag
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => step(1)}
            aria-label="Nästa månad"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="calendar-grid" role="grid" aria-label="Månadskalender">
        {WEEKDAY_LABELS.map((label) => (
          <div className="calendar-weekday" key={label} role="columnheader">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const count = counts.byDay.get(day.iso) ?? 0;
          const isSelected = selected === day.iso;
          const classes = [
            'calendar-day',
            day.inMonth ? '' : 'calendar-day-outside',
            day.isToday ? 'calendar-day-today' : '',
            isSelected ? 'calendar-day-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              type="button"
              key={day.iso}
              className={classes}
              onClick={() => onSelect(isSelected ? null : day.iso)}
              aria-pressed={isSelected}
              aria-label={dayAriaLabel(day, count)}
              data-testid={`calendar-day-${day.iso}`}
            >
              <span>{day.day}</span>
              {count > 0 ? (
                <span className="calendar-day-count">{count}</span>
              ) : (
                <span className="calendar-day-empty-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <p className="field-hint">
        {counts.total === 0
          ? 'Inga poster med datum ännu. Lägg till en post med datum så syns den i kalendern.'
          : `${counts.total} poster med datum${
              counts.withoutDate > 0 ? ` · ${counts.withoutDate} utan datum` : ''
            }.`}
      </p>
    </div>
  );
};
