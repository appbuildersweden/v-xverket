import React from 'react';
import { BelonningarYta } from '../components/rewards/BelonningarYta';
import {
  Calendar,
  CheckSquare,
  Users,
  MessageCircle,
  FileText,
  Award,
  Clock,
  BookOpen,
  Play,
  Layers,
  ClipboardList,
  Plus,
  Brain,
} from 'lucide-react';

interface PageProps {
  pageId: string;
}

const now = new Date();
const weekNum = Math.ceil(
  ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 +
    new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7,
);
const days = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const months = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

const greeting = () => {
  const h = now.getHours();
  return h < 12 ? 'God morgon!' : h < 17 ? 'God eftermiddag!' : 'God kväll!';
};

/* Delad sidrubrik (rubrik + navigationsstig) renderas av App — innehåll nedan */

export const ElevPanel: React.FC<PageProps> = ({ pageId }) => {
  switch (pageId) {
    // ------------------------------------------------------------ Översikt
    case 'start':
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{greeting()}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13.5, marginTop: 2 }}>
                Här är det viktigaste för din skoldag.
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-3)' }}>
              <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14 }}>
                {days[now.getDay()]}
              </div>
              {now.getDate()} {months[now.getMonth()]} {now.getFullYear()} • Vecka {weekNum}
            </div>
          </div>

          {/* Prioriterat: schema, uppgifter, prov — sen kalender och framsteg */}
          <div className="grid-3">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Dagens schema</div>
              </div>
              <div className="card-sub">Kommande lektioner idag</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Clock size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Svenska</div>
                  <div className="list-item-sub">08:30 – 09:30 • Lärare: Andersson</div>
                </div>
                <span className="badge badge-solid">Nu</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><BookOpen size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Matematik</div>
                  <div className="list-item-sub">10:00 – 11:00 • Lärare: Lindberg</div>
                </div>
                <span className="badge">Kommande</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Users size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Idrott</div>
                  <div className="list-item-sub">13:00 – 14:00 • Lärare: Eriksson</div>
                </div>
                <span className="badge">Kommande</span>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-title">Att göra</div>
              </div>
              <div className="card-sub">Uppgifter som behöver göras</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Läsförståelse</div>
                  <div className="list-item-sub">Svenska • Imorgon</div>
                </div>
                <span className="badge badge-solid">Imorgon</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Mattehäften s. 45–47</div>
                  <div className="list-item-sub">Matematik • Onsdag</div>
                </div>
                <span className="badge">3 dagar</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Provförberedelser</div>
                  <div className="list-item-sub">Svenska • Fredag</div>
                </div>
                <span className="badge">5 dagar</span>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-title">Kommande prov</div>
              </div>
              <div className="card-sub">Kalender och viktiga datum</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Prov i svenska</div>
                  <div className="list-item-sub">Fredag 09:00</div>
                </div>
                <span className="badge">Prov</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Calendar size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Klassmöte</div>
                  <div className="list-item-sub">Onsdag 13:00</div>
                </div>
                <span className="badge">Datum</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><FileText size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Inlämning: Essä</div>
                  <div className="list-item-sub">Svenska • Nästa vecka</div>
                </div>
                <span className="badge">Inlämning</span>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="card">
              <div className="card-title">Mina framsteg</div>
              <div className="card-sub">Terminens mål</div>
              <div className="progress-row">
                <span>Skolmål</span>
                <b>2 av 5 klara</b>
              </div>
              <div className="progress">
                <div className="progress-fill" style={{ width: '40%' }} />
              </div>
              <div className="bar-row">
                <span className="lbl">Svenska</span>
                <span className="bar"><i style={{ width: '85%' }} /></span>
                <span className="num">85</span>
              </div>
              <div className="bar-row" style={{ marginBottom: 0 }}>
                <span className="lbl">Matematik</span>
                <span className="bar"><i style={{ width: '72%' }} /></span>
                <span className="num">72</span>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Belöningar</div>
              <div className="card-sub">Dina samlade poäng och nivå</div>
              <div className="progress-row">
                <span>Nivå 2 • Nybörjare</span>
                <b>12 av 20 poäng</b>
              </div>
              <div className="progress">
                <div className="progress-fill" style={{ width: '60%' }} />
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Award size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Stjärnan</div>
                  <div className="list-item-sub">3 av 5 samlade</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    // ------------------------------------------------------- Min planering
    case 'planering':
      return (
        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Denna vecka</div>
                <div className="card-sub">Egen planering — ändringar sparas i ett senare steg</div>
              </div>
              <button className="btn btn-primary btn-sm">
                <Plus size={14} /> Ny aktivitet
              </button>
            </div>
            {['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'].map((d, i) => (
              <div className="list-item" key={d}>
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Calendar size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">{d}</div>
                  <div className="list-item-sub">
                    {['Svenska, Matematik, Bild', 'Matematik, Naturkunskap, Svenska', 'Idrott, Engelska, SO', 'Svenska, Matte, Musik', 'Matematik, Engelska, SL'][i]}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Kommande aktiviteter</div>
            <div className="card-sub">Kalender och viktiga datum</div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Calendar size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Klassmöte</div>
                <div className="list-item-sub">Onsdag 13:00</div>
              </div>
            </div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Prov i svenska</div>
                <div className="list-item-sub">Fredag 09:00</div>
              </div>
            </div>
          </div>
        </div>
      );

    // ---------------------------------------------------------- Mina ämnen
    case 'amnen':
      return (
        <div>
          <div className="grid-3">
            {[
              { n: 'Svenska', l: 'Andersson', p: 85 },
              { n: 'Matematik', l: 'Lindberg', p: 72 },
              { n: 'Engelska', l: 'Nilsson', p: 78 },
            ].map((s) => (
              <div className="stat-card" key={s.n}>
                <div>
                  <div className="lbl">Ämne</div>
                  <div className="val" style={{ fontSize: 18 }}>{s.n}</div>
                  <div className="det">Lärare: {s.l}</div>
                </div>
                <div className="stat-icon"><BookOpen size={18} /></div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Framsteg per ämne</div>
            <div className="card-sub">Exempeldata — kopplas till riktiga betyg och omdömen senare</div>
            {[
              { n: 'Svenska', p: 85 },
              { n: 'Matematik', p: 72 },
              { n: 'Engelska', p: 78 },
              { n: 'Naturkunskap', p: 64 },
              { n: 'Historia', p: 70 },
            ].map((s) => (
              <div className="bar-row" key={s.n}>
                <span className="lbl">{s.n}</span>
                <span className="bar"><i style={{ width: `${s.p}%` }} /></span>
                <span className="num">{s.p}</span>
              </div>
            ))}
          </div>
        </div>
      );

    // ------------------------------------------------------------ Uppgifter
    case 'uppgifter':
      return (
        <div className="card">
          <div className="card-title">Uppgifter</div>
          <div className="card-sub">Dina tilldelade uppgifter och inlämningar</div>
          <div className="list-item">
            <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
            <div className="list-item-content">
              <div className="list-item-title">Läsförståelse uppgift</div>
              <div className="list-item-sub">Svenska • Inlämning imorgon</div>
            </div>
            <button className="btn btn-primary btn-sm">Lämna in</button>
          </div>
          <div className="list-item">
            <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
            <div className="list-item-content">
              <div className="list-item-title">Mattehäften s. 45–47</div>
              <div className="list-item-sub">Matematik • Inlämning onsdag</div>
            </div>
            <button className="btn btn-primary btn-sm">Lämna in</button>
          </div>
          <div className="list-item">
            <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
            <div className="list-item-content">
              <div className="list-item-title">Provförberedelser</div>
              <div className="list-item-sub">Svenska • Inlämning fredag</div>
            </div>
            <button className="btn btn-outline btn-sm" disabled>Ej öppnad</button>
          </div>
          <div className="list-item">
            <div className="stat-icon" style={{ width: 34, height: 34 }}><Award size={15} /></div>
            <div className="list-item-content">
              <div className="list-item-title">Essä: Min sommar</div>
              <div className="list-item-sub">Svenska • Återkoppling: bra formulerat, se kommentarer</div>
            </div>
            <span className="badge badge-solid">Betygsatt</span>
          </div>
        </div>
      );

    // ----------------------------------------------------- Flashcards
    case 'flashcards':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Flashcards & repetition</div>
              <div className="card-sub">Repetera ord och begrepp med kortlek</div>
            </div>
            <button className="btn btn-primary btn-sm">
              <Plus size={14} /> Ny kortlek
            </button>
          </div>
          {[
            { t: 'Engelska: Ordförråd', s: '20 kort • 12 klara', p: 60 },
            { t: 'Matematik: Formler', s: '15 kort • 5 klara', p: 33 },
            { t: 'Historia: Årtal', s: '12 kort • 12 klara', p: 100 },
          ].map((o) => (
            <div className="list-item" key={o.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Layers size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{o.t}</div>
                <div className="list-item-sub">{o.s}</div>
                <div className="progress" style={{ marginTop: 8, marginBottom: 0 }}>
                  <div className="progress-fill" style={{ width: `${o.p}%` }} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Repetera</button>
            </div>
          ))}
        </div>
      );

    // ------------------------------------------------------- Provträning
    case 'provtraning':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Provträning</div>
              <div className="card-sub">Öva på prov i ämnen du väljer</div>
            </div>
          </div>
          {[
            { t: 'Provträning: Svenska', s: '10 frågor • Avkunnad nivå' },
            { t: 'Provträning: Matematik', s: '15 frågor • Grundnivå' },
            { t: 'Provträning: Engelska', s: '12 frågor • Medelnivå' },
          ].map((o) => (
            <div className="list-item" key={o.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{o.t}</div>
                <div className="list-item-sub">{o.s}</div>
              </div>
              <button className="btn btn-primary btn-sm">
                <Play size={14} /> Starta
              </button>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
            Frågorna kopplas till riktigt provmaterial när innehållsbiblioteket är anslutet.
          </p>
        </div>
      );

    // -------------------------------------------------------- Mina framsteg
    case 'framsteg':
      return (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Framsteg per ämne</div>
            <div className="card-sub">Exempeldata — kopplas senare</div>
            <div className="bar-row">
              <span className="lbl">Svenska</span>
              <span className="bar"><i style={{ width: '85%' }} /></span>
              <span className="num">85</span>
            </div>
            <div className="bar-row">
              <span className="lbl">Matematik</span>
              <span className="bar"><i style={{ width: '72%' }} /></span>
              <span className="num">72</span>
            </div>
            <div className="bar-row">
              <span className="lbl">Engelska</span>
              <span className="bar"><i style={{ width: '78%' }} /></span>
              <span className="num">78</span>
            </div>
            <div className="bar-row" style={{ marginBottom: 0 }}>
              <span className="lbl">Naturkunskap</span>
              <span className="bar"><i style={{ width: '64%' }} /></span>
              <span className="num">64</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Mina mål</div>
            <div className="card-sub">Terminens mål och uppföljning</div>
            <div className="progress-row">
              <span>Skolmål</span>
              <b>2 av 5 klara</b>
            </div>
            <div className="progress">
              <div className="progress-fill" style={{ width: '40%' }} />
            </div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Läsa 3 böcker</div>
                <div className="list-item-sub">2 av 3 klara</div>
              </div>
            </div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><CheckSquare size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Bättre betyg i matematik</div>
                <div className="list-item-sub">Pågår</div>
              </div>
            </div>
          </div>
        </div>
      );

    // -------------------------------------------------- Belöningar & nivåer
    case 'belonningar':
      return (
        <BelonningarYta
          title="Belöningar & nivåer"
          subtitle="Samla XP, lås upp föremål och se din egen trädgård växa."
          showQuickTasks
        />
      );

    // --------------------------------------------------- Klassinformation
    case 'klass':
      return (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Klassinformation</div>
            <div className="card-sub">Exempeldata — kopplas till skolregistret senare</div>
            <div className="profile-row">
              <span className="k">Klass</span>
              <span className="v">7B</span>
            </div>
            <div className="profile-row">
              <span className="k">Klasslärare</span>
              <span className="v">Andersson</span>
            </div>
            <div className="profile-row">
              <span className="k">Lokal</span>
              <span className="v">Sal 24</span>
            </div>
            <div className="profile-row">
              <span className="k">Elever</span>
              <span className="v">24</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Nyheter i klassen</div>
            <div className="card-sub">Exempeldata</div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><MessageCircle size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Nytt inlägg: gruppuppgift i matte</div>
                <div className="list-item-sub">Igår</div>
              </div>
            </div>
            <div className="list-item">
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Calendar size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Klassmöte på onsdag</div>
                <div className="list-item-sub">2 dagar sedan</div>
              </div>
            </div>
          </div>
        </div>
      );

    // ----------------------------------------------------- Klasskamrater
    case 'kamrater':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Klasskamrater</div>
              <div className="card-sub">Elever i din klass</div>
            </div>
            <input className="input" placeholder="Sök kamrat…" style={{ maxWidth: 220 }} />
          </div>
          {['Alva', 'Benjamin', 'Clara', 'David', 'Ella', 'Felix', 'Greta', 'Hugo'].map((n) => (
            <div className="list-item" key={n}>
              <div className="avatar-circle">{n.charAt(0)}</div>
              <div className="list-item-content">
                <div className="list-item-title">{n}</div>
                <div className="list-item-sub">7B</div>
              </div>
              <button className="btn btn-outline btn-sm">Visa profil</button>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
            Endast elever i din egen klass visas. Elever i andra klasser är inte åtkomliga.
          </p>
        </div>
      );

    // -------------------------------------------------------- Klasschatt
    case 'klasschatt':
      return (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-title">Klasschatt</div>
          <div className="card-sub">Chatt med din klass — meddelandehistorik kopplas senare</div>
          <div className="list-item">
            <div className="avatar-circle">A</div>
            <div className="list-item-content">
              <div className="list-item-title">Alva</div>
              <div className="list-item-sub">"När ska vi ses till grupparbetet?"</div>
            </div>
            <span className="badge badge-solid">Oläst</span>
          </div>
          <div className="list-item">
            <div className="avatar-circle">F</div>
            <div className="list-item-content">
              <div className="list-item-title">Felix</div>
              <div className="list-item-sub">"Jag kan på torsdag!"</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <input className="input" placeholder="Skriv ett meddelande…" />
            <button className="btn btn-primary" disabled>Skicka</button>
          </div>
        </div>
      );

    // --------------------------------------------------------- Dokument
    case 'dokument':
      return (
        <div className="card">
          <div className="card-title">Mina dokument</div>
          <div className="card-sub">Exempeldata — dokumentlagret kopplas senare</div>
          {['Matteanteckningar.pdf', 'Svenska-essay.docx'].map((d) => (
            <div className="list-item" key={d}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><FileText size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{d}</div>
                <div className="list-item-sub">Sparad</div>
              </div>
              <button className="btn btn-outline btn-sm">Öppna</button>
            </div>
          ))}
        </div>
      );

    default:
      return (
        <div className="empty-state">
          <Brain size={40} />
          <h3>Välj en kategori i sidomenyn</h3>
        </div>
      );
  }
};
