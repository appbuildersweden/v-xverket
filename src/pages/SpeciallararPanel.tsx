import React, { useCallback, useState } from 'react';
import {
  Users,
  MessageSquare,
  Globe,
  Circle,
  BookOpen,
  ClipboardList,
  Award,
  CheckSquare,
  FileText,
  User,
} from 'lucide-react';
import { BelonningarYta, BelonningModal } from '../components/rewards/BelonningarYta';
import { Planeringspanel } from './Planeringspanel';
import type { UnlockCelebration } from '../lib/rewards';

interface PageProps {
  pageId: string;
  /** Panelen är gemensam för lärare och speciallärare — hemsidan anpassas. */
  role?: 'lärare' | 'speciallärare';
}

// ----------------------------------------------------------------
// Hjälpare för att visa en upplåst belöning från planeringspanelen.
// Samma belöningsruta används som i belöningsytan.
// ----------------------------------------------------------------

function useCelebration(): [UnlockCelebration | null, (u: UnlockCelebration[]) => void, () => void] {
  const [current, setCurrent] = useState<UnlockCelebration | null>(null);
  const [queue, setQueue] = useState<UnlockCelebration[]>([]);

  const show = useCallback((unlocks: UnlockCelebration[]) => {
    if (unlocks.length === 0) return;
    setQueue((prev) => [...prev, ...unlocks]);
  }, []);

  React.useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  return [current, show, () => setCurrent(null)];
}

export const SpeciallararPanel: React.FC<PageProps> = ({ pageId, role = 'speciallärare' }) => {
  const isTeacher = role === 'lärare';
  // Delad belöningsruta för upplåsningar som sker i planeringspanelen.
  const [celebrationReward, showCelebration, closeCelebration] = useCelebration();
  const celebration = {
    current: celebrationReward,
    show: showCelebration,
    close: closeCelebration,
  };

  switch (pageId) {
    case 'hem':
      return (
        <div>
          <div className="banner">
            <h2>{isTeacher ? 'Din undervisning' : 'Specialpedagogiskt arbete'}</h2>
            <p>
              {isTeacher
                ? 'Planera, dela material och följ upp dina klasser. Menyn visar de funktioner du valde vid registreringen — du kan ändra dem under Profil.'
                : 'Följ upp elevers framsteg, ge stöd och samarbeta med lärare och vårdnadshavare.'}
            </p>
          </div>

          <div className="grid-3">
            <div className="stat-card">
              <div>
                <div className="lbl">Elever i fokus</div>
                <div className="val">18</div>
                <div className="det">Exempeldata</div>
              </div>
              <div className="stat-icon"><Users size={18} /></div>
            </div>
            <div className="stat-card">
              <div>
                <div className="lbl">Pågående uppgifter</div>
                <div className="val">4</div>
                <div className="det">Exempeldata</div>
              </div>
              <div className="stat-icon"><CheckSquare size={18} /></div>
            </div>
            <div className="stat-card">
              <div>
                <div className="lbl">Meddelanden</div>
                <div className="val">7</div>
                <div className="det">Olästa</div>
              </div>
              <div className="stat-icon"><MessageSquare size={18} /></div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="card">
              <div className="card-title">Snabbsökning</div>
              <div className="card-sub">Sök elev, klass eller ämne</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" placeholder="Sök elev, klass eller ämne..." />
                <button className="btn btn-outline">Sök</button>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Senaste aktiviteten</div>
              <div className="card-sub">Exempeldata</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><FileText size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Elev lade till nytt dokument</div>
                  <div className="list-item-sub">Igår • Elevdokument</div>
                </div>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Award size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Belöning utdelad</div>
                  <div className="list-item-sub">Igår • Framsteg</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'elever':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Mina elever</div>
              <div className="card-sub">Exempeldata — elevregistret kopplas senare</div>
            </div>
            <button className="btn btn-outline btn-sm">Lägg till</button>
          </div>
          {[
            { n: 'Elev A', k: '7B', s: 'Aktiv' },
            { n: 'Elev B', k: '7B', s: 'Aktiv' },
            { n: 'Elev C', k: '8A', s: 'Behöver stöd' },
            { n: 'Elev D', k: '8A', s: 'Aktiv' },
          ].map((e) => (
            <div className="list-item" key={e.n}>
              <div className="avatar-circle">{e.n.charAt(0)}</div>
              <div className="list-item-content">
                <div className="list-item-title">{e.n}</div>
                <div className="list-item-sub">Klass {e.k}</div>
              </div>
              <span className={`badge ${e.s === 'Aktiv' ? '' : 'badge-solid'}`}>{e.s}</span>
            </div>
          ))}
        </div>
      );

    case 'meddelande-elever':
      return (
        <div className="card">
          <div className="card-title">Meddelande-elever</div>
          <div className="card-sub">Exempeldata — elever som behöver stöd</div>
          {[
            { n: 'Elev C', m: '"Jag förstår inte bråken i matten."' },
            { n: 'Elev B', m: '"Kan vi boka tid för uppföljning?"' },
          ].map((x) => (
            <div className="list-item" key={x.n}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><MessageSquare size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.n}</div>
                <div className="list-item-sub">{x.m}</div>
              </div>
              <button className="btn btn-primary btn-sm">Svara</button>
            </div>
          ))}
        </div>
      );

    case 'global-chatt':
      return (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-title">Global chatt</div>
          <div className="card-sub">Personalens diskussionskanal. Chatt kopplas senare.</div>
          <div className="list-item">
            <div className="stat-icon" style={{ width: 34, height: 34 }}><Globe size={15} /></div>
            <div className="list-item-content">
              <div className="list-item-title">Allmänt • Personal</div>
              <div className="list-item-sub">Exempeldata</div>
            </div>
          </div>
          <input className="input" placeholder="Skriv ett meddelande..." style={{ marginTop: 14 }} disabled />
        </div>
      );

    case 'private-chattar':
      return (
        <div className="card">
          <div className="card-title">Privata chattar</div>
          <div className="card-sub">Exempeldata — privata samtal kopplas senare</div>
          {['Kollega A', 'Kollega B'].map((k) => (
            <div className="list-item" key={k}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Circle size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{k}</div>
                <div className="list-item-sub">Privat samtal</div>
              </div>
            </div>
          ))}
        </div>
      );

    case 'material':
      return (
        <div className="grid-3">
          {[
            { t: 'Lässtrategi-guide', s: 'PDF' },
            { t: 'Mattearbetsblad', s: 'PDF' },
            { t: 'AI-genererade övningar', s: 'Samling' },
          ].map((m) => (
            <div className="stat-card" key={m.t} style={{ cursor: 'pointer' }}>
              <div>
                <div className="lbl">{m.s}</div>
                <div className="val" style={{ fontSize: 16 }}>{m.t}</div>
                <div className="det">Exempeldata</div>
              </div>
              <div className="stat-icon"><BookOpen size={18} /></div>
            </div>
          ))}
        </div>
      );

    case 'uppföljning':
      return (
        <div className="card">
          <div className="card-title">Uppgifter & uppföljning</div>
          <div className="card-sub">Exempeldata</div>
          {[
            { t: 'Läs- och skrivtest', s: '7 elever • Inte startat', tag: 'Väntar' },
            { t: 'Framstegsutvärdering Q2', s: '18 elever • 3 av 18 klara', tag: 'Pågående' },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
              <span className={`badge ${x.tag === 'Pågående' ? 'badge-solid' : ''}`}>{x.tag}</span>
            </div>
          ))}
        </div>
      );

    case 'planering':
      return (
        <>
          <Planeringspanel onUnlocked={(u) => celebration.show(u)} />
          <BelonningModal reward={celebration.current} onClose={celebration.close} />
        </>
      );

    case 'belonningar':
      return <BelonningarYta
        title="Belöningar & upplåsningar"
        subtitle="Samla XP för slutförda arbetsuppgifter, lås upp föremål och se din magiska trädgård växa."
      />;

    default:
      return (
        <div className="empty-state">
          <User size={40} />
          <h3>Välj en kategori i sidomenyn</h3>
        </div>
      );
  }
};
