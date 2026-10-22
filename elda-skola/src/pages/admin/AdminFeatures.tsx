import React, { useEffect, useState } from 'react';
import { Ghost, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
import { Alert, Badge, Card, PageIntro } from '../../components/ui';
import {
  cachedPlatformFeatures,
  refreshPlatformFeatures,
  savePlatformFeatureFlags,
} from '../../lib/features';
import type { PlatformFeatures } from '../../lib/types';

/**
 * Funktionshantering.
 *
 * Skolans administratör slår på eller stänger av elevfunktionerna. Växlarna
 * sparas i `platform_features` på servern och gäller hela Elda Skola – alla
 * elever, alla enheter. Att stänga av tar aldrig bort XP, köp, upplåsta delar
 * eller sparade avatarer; servern stoppar bara nya köp, upplåsningar, byten och
 * teman medan funktionen är avstängd.
 */

type FeatureKey = 'shop' | 'avatars' | 'halloween';

interface FeatureRow {
  key: FeatureKey;
  title: string;
  icon: React.ReactNode;
  description: string;
  onEffect: string;
  offEffect: string;
}

const FEATURES: FeatureRow[] = [
  {
    key: 'shop',
    title: 'XP-shoppen',
    icon: <ShoppingBag size={19} aria-hidden />,
    description: 'Låt eleverna öppna butiken och köpa teman, figurer, ramar och effekter för XP.',
    onEffect: 'Eleverna kan öppna butiken och handla för intjänad XP.',
    offEffect:
      'Butiken är stängd för eleverna. XP, nivå och alla tidigare köp ligger kvar och syns igen när du slår på den.',
  },
  {
    key: 'avatars',
    title: 'Avatarer och figurer',
    icon: <UserRound size={19} aria-hidden />,
    description: 'Låt eleverna bygga sin avatar, välja figurer och låsa upp nya delar.',
    onEffect: 'Eleverna kan byta avatar, använda figurer och låsa upp nya delar.',
    offEffect:
      'Avatarstudion och figurerna är stängda. Redan sparade avatarer och upplåsta delar ligger kvar orörda.',
  },
  {
    key: 'halloween',
    title: 'Halloween-temat',
    icon: <Ghost size={19} aria-hidden />,
    description: 'Låt eleverna använda Halloween-området och dess tema i hela appen.',
    onEffect: 'Halloween-området är öppet och elevernas valda tema syns i appen.',
    offEffect:
      'Halloween är stängt och Elda Skolas vanliga utseende visas. Samling, rum och temaval sparas till nästa gång.',
  },
];

const labelFor = (key: FeatureKey) => FEATURES.find((row) => row.key === key)?.title ?? key;

export const AdminFeatures: React.FC = () => {
  const [features, setFeatures] = useState<PlatformFeatures>(cachedPlatformFeatures);
  const [busy, setBusy] = useState<FeatureKey | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void refreshPlatformFeatures()
      .then((next) => {
        if (live) setFeatures(next);
      })
      .catch(() => {
        if (live) {
          setError(
            'Kunde inte läsa funktionsläget från servern. Ladda om sidan innan du ändrar något, så att du inte råkar slå på eller stänga av fel funktion.',
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const toggle = async (key: FeatureKey) => {
    if (busy) return;
    const next = { ...features, [key]: !features[key] };
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      const result = await savePlatformFeatureFlags({
        shop: next.shop,
        avatars: next.avatars,
        halloween: next.halloween,
      });
      setFeatures(result);
      setSaved(
        `${labelFor(key)} är nu ${result[key] ? 'aktiverad' : 'avstängd'} för alla elever.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Inställningen kunde inte sparas. Försök igen om en stund.',
      );
    } finally {
      setBusy(null);
    }
  };

  const enabledCount = FEATURES.filter((row) => features[row.key]).length;

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Administratörspanel"
        title="Funktionshantering"
        description="Slå på eller stäng av elevfunktionerna för hela Elda Skola. Ändringarna sparas på servern och gäller direkt, även på andra enheter."
        actions={
          <Badge tone={enabledCount === FEATURES.length ? 'green' : 'amber'}>
            {enabledCount} av {FEATURES.length} aktiva
          </Badge>
        }
      />

      {saved && <Alert tone="success">{saved}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card
        title="Funktioner för elever"
        subtitle="Växla läge med knappen till höger. Ingen data tas bort när en funktion stängs av."
      >
        <ul className="feature-list">
          {FEATURES.map((row) => {
            const on = features[row.key];
            const label = on ? 'Aktiverad' : 'Avstängd';
            return (
              <li key={row.key} className={`feature-row ${on ? 'is-on' : 'is-off'}`}>
                <div className="feature-row-main">
                  <span className={`feature-icon ${on ? 'is-on' : ''}`} aria-hidden>
                    {row.icon}
                  </span>
                  <div className="feature-text">
                    <div className="feature-title">
                      <strong>{row.title}</strong>
                      <Badge tone={on ? 'green' : 'amber'}>{label}</Badge>
                    </div>
                    <p className="feature-desc">{row.description}</p>
                    <p className="feature-effect">{on ? row.onEffect : row.offEffect}</p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${row.title}: ${label.toLocaleLowerCase('sv')}`}
                  className={`feature-switch ${on ? 'is-on' : ''}`}
                  disabled={busy === row.key}
                  onClick={() => void toggle(row.key)}
                >
                  <span className="feature-switch-knob" aria-hidden />
                  <span className="sr-only">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Så fungerar det" subtitle="Sparat på servern – inte i webbläsaren">
        <div className="feature-note">
          <ShieldCheck size={18} aria-hidden />
          <div>
            <p style={{ marginBottom: 6 }}>
              Växlarna gäller hela skolplattformen och kontrolleras i databasen. En elev kan
              inte kringgå en avstängning genom att använda en annan enhet eller anropa
              appen direkt.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              XP, köp, upplåsta delar, rum och sparade avatarer ligger kvar oförändrade.
              När du slår på funktionen igen fungerar allt som tidigare.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
