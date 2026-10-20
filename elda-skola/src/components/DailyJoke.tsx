import React from 'react';
import { Laugh } from 'lucide-react';
import { jokeForDay } from '../lib/jokes';

interface Props {
  /** Datum som avgör dagens skämt. Standard är nu. */
  date?: Date;
}

export const DailyJoke: React.FC<Props> = ({ date }) => {
  const joke = jokeForDay(date ?? new Date());
  return (
    <section className="joke-card" aria-labelledby="daily-joke-title">
      <div className="joke-icon" aria-hidden="true">
        <Laugh size={22} />
      </div>
      <div className="joke-body">
        <p id="daily-joke-title" className="joke-eyebrow">
          Dagens skratt
        </p>
        <p className="joke-text" data-joke-id={joke.id}>
          {joke.text}
        </p>
      </div>
    </section>
  );
};
