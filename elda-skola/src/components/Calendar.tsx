import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayIso } from '../lib/format';

export interface CalendarItem {
  id: string;
  label: string;
  kind: 'task' | 'event' | 'activity';
  done?: boolean;
}

interface Props {
  month: Date;
  items: Record<string, CalendarItem[]>;
  selected: string | null;
  onSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
}

const DOW = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export const MonthCalendar: React.FC<Props> = ({
  month,
  items,
  selected,
  onSelect,
  onMonthChange,
}) => {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(start.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date,
        key: iso(date),
        otherMonth: date.getMonth() !== month.getMonth(),
      };
    });
  }, [month]);

  const today = todayIso();

  return (
    <div>
      <div className="calendar-head">
        <h2>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </h2>
        <div className="row" style={{ gap: 5 }}>
          <button
            className="icon-btn"
            type="button"
            aria-label="Föregående månad"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onMonthChange(new Date())}
          >
            Idag
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Nästa månad"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid" role="grid" aria-label="Månadskalender">
        {DOW.map((day) => (
          <div key={day} className="cal-dow">
            {day}
          </div>
        ))}
        {cells.map((cell) => {
          const list = items[cell.key] ?? [];
          return (
            <div
              key={cell.key}
              role="gridcell"
              className={[
                'calendar-cell',
                cell.otherMonth ? 'other-month' : '',
                cell.key === today ? 'today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(cell.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(cell.key);
                }
              }}
              tabIndex={0}
              aria-selected={selected === cell.key}
              style={selected === cell.key ? { borderColor: 'var(--green)', boxShadow: 'inset 0 0 0 1px var(--green)' } : undefined}
            >
              <span className="calendar-date">{cell.date.getDate()}</span>
              {list.slice(0, 3).map((item) => (
                <span
                  key={`${item.kind}-${item.id}`}
                  className={`calendar-item ${item.kind} ${item.done ? 'done' : ''}`}
                  title={item.label}
                >
                  {item.label}
                </span>
              ))}
              {list.length > 3 && <span className="small muted">+{list.length - 3}</span>}
            </div>
          );
        })}
      </div>
      <style>{`.cal-dow{text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);font-weight:700;padding-bottom:2px}`}</style>
    </div>
  );
};

/** Bygger item-kartan från uppgifter och händelser. */
export function groupCalendarItems(
  tasks: Array<{ id: string; title: string; due_date: string | null; status?: string }>,
  events: Array<{ id: string; title: string; starts_at: string }>,
): Record<string, CalendarItem[]> {
  const map: Record<string, CalendarItem[]> = {};
  const push = (date: string, item: CalendarItem) => {
    const key = date.slice(0, 10);
    map[key] = [...(map[key] ?? []), item];
  };
  for (const task of tasks) {
    if (task.due_date) {
      push(task.due_date, {
        id: task.id,
        label: task.title,
        kind: 'task',
        done: task.status === 'klar',
      });
    }
  }
  for (const event of events) {
    push(event.starts_at, { id: event.id, label: event.title, kind: 'event' });
  }
  return map;
}

