import React from 'react';
import { ArrowRight, Ghost, Sparkles } from 'lucide-react';
import { Button } from '../ui';
import { useHalloween } from '../../lib/halloween-context';
import { usePlatformFeatures } from '../../lib/features';
import AvatarArt from './AvatarArt';

/**
 * Ingången till Halloween från startsidan och profilen.
 *
 * Visar elevens riktiga avatar och saldo – inte en statisk bild – och släpper
 * in i Halloween-området. Temat kan slås på och av direkt härifrån.
 */
export const HalloweenInvite: React.FC<{
  onOpen: () => void;
  variant?: 'banner' | 'card';
}> = ({ onOpen, variant = 'banner' }) => {
  const { look, parts, wallet, collection, themeKey, freeTheme, setFreeTheme } = useHalloween();
  const { halloween } = usePlatformFeatures();

  // Är Halloween avstängt finns ingen ingång och inget tema att slå på.
  if (!halloween) return null;

  const themeLabel = themeKey ? 'Säsongstema på' : 'Säsongstema av';

  if (variant === 'card') {
    return (
      <section className="halloween-invite halloween-invite-card" aria-labelledby="halloween-invite-title">
        <div className="halloween-invite-avatar">
          <AvatarArt look={look} parts={parts} label="Din Halloween-avatar" />
        </div>
        <div className="halloween-invite-text">
          <h2 id="halloween-invite-title">
            <Ghost size={18} aria-hidden /> Halloween
          </h2>
          <p>
            {wallet.total_xp} XP · nivå {wallet.level} · {collection.length} föremål i samlingen.
          </p>
          <label className="halloween-switch">
            <input
              type="checkbox"
              checked={freeTheme}
              onChange={(event) => setFreeTheme(event.target.checked)}
            />
            <span aria-hidden className="halloween-switch-track" />
            <span>{themeLabel} i hela appen</span>
          </label>
          <Button size="sm" onClick={onOpen}>
            Öppna Halloween
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="halloween-invite" aria-labelledby="halloween-invite-title">
      <div className="halloween-invite-avatar">
        <AvatarArt look={look} parts={parts} label="Din Halloween-avatar" />
      </div>
      <div className="halloween-invite-text">
        <span className="halloween-eyebrow">
          <Ghost size={14} aria-hidden /> Säsong 2026
        </span>
        <h2 id="halloween-invite-title">Din Halloween-avatar väntar</h2>
        <p>
          <Sparkles size={14} aria-hidden /> {wallet.total_xp} XP · {collection.length} föremål ·
          bygg vidare på din samling.
        </p>
      </div>
      <Button onClick={onOpen} icon={<ArrowRight size={16} />}>
        Till Halloween
      </Button>
    </section>
  );
};
