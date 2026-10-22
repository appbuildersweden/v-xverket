import React, { useMemo, useState } from 'react';
import {
  Ghost,
  Moon,
  Package,
  Palette,
  ShoppingBag,
  Sparkles,
  Trees,
  UserRound,
  Wand2,
} from 'lucide-react';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useHalloween } from '../../lib/halloween-context';
import { displayName } from '../../lib/format';
import { THEME_META, levelProgress } from '../../lib/halloween-catalog';
import { isSeasonActive } from '../../lib/halloween';
import { usePlatformFeatures } from '../../lib/features';
import { AvatarStudio } from '../../components/halloween/AvatarStudio';
import { HalloweenCollection } from '../../components/halloween/HalloweenCollection';
import { HalloweenRoom } from '../../components/halloween/HalloweenRoom';
import { HalloweenShop } from '../../components/halloween/HalloweenShop';
import AvatarArt from '../../components/halloween/AvatarArt';
import { ProductArt } from '../../components/halloween/ProductArt';

/**
 * Halloween-området i elevpanelen.
 *
 * En plats för hela säsongen: saldo och nivå, den egna avataren, shopen,
 * samlingen och rummet. Allt läses från servern via HalloweenProvider, som
 * också sätter säsongstemat – även när eleven går tillbaka till en vanlig
 * skolsida. Det fria temat värmer bara accenter, det målar inte om appen.
 */

type Tab = 'shop' | 'avatar' | 'collection' | 'room';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'shop', label: 'Shop', icon: <ShoppingBag size={17} /> },
  { id: 'avatar', label: 'Avatar', icon: <UserRound size={17} /> },
  { id: 'collection', label: 'Samling', icon: <Package size={17} /> },
  { id: 'room', label: 'Rummet', icon: <Trees size={17} /> },
];

export const Halloween: React.FC = () => {
  const { profile, identity } = useAuth();
  const {
    ready,
    loading,
    error,
    reload,
    look,
    parts,
    wallet,
    products,
    seasons,
    purchases,
    collection,
    room,
    themeKey,
    freeTheme,
    setFreeTheme,
    activateTheme,
    equipped,
  } = useHalloween();

  const [tab, setTab] = useState<Tab>('shop');

  // Skolans funktionsväxlar: shoppen, avatarer/figurer och hela området.
  const { shop: shopEnabled, avatars: avatarsEnabled, halloween: halloweenEnabled } =
    usePlatformFeatures();

  const tabs = useMemo(
    () =>
      TABS.filter((row) =>
        row.id === 'shop'
          ? shopEnabled
          : row.id === 'avatar'
            ? avatarsEnabled
            : true,
      ),
    [shopEnabled, avatarsEnabled],
  );
  // En flik som stängts av medan eleven står på den får aldrig lämna en tom yta.
  const activeTab: Tab = tabs.some((row) => row.id === tab)
    ? tab
    : (tabs.find((row) => row.id === 'collection')?.id ?? tabs[0].id);

  const name = profile ? displayName(profile) : identity?.username ?? 'Elev';

  const season = seasons.find((row) => row.id === 'halloween') ?? null;
  const seasonActive = season ? isSeasonActive(season) : false;

  const themeProduct = useMemo(() => {
    const productId = equipped.tema;
    if (!productId) return null;
    return purchases.find((row) => row.product_id === productId) ?? null;
  }, [equipped.tema, purchases]);

  const frame = useMemo(() => {
    const productId = equipped.ram;
    if (!productId) return null;
    return purchases.find((row) => row.product_id === productId) ?? null;
  }, [equipped.ram, purchases]);

  const badge = useMemo(() => {
    const productId = equipped.marke;
    if (!productId) return null;
    return purchases.find((row) => row.product_id === productId) ?? null;
  }, [equipped.marke, purchases]);

  const companion = useMemo(() => {
    const productId = equipped.figur;
    if (!productId) return null;
    return purchases.find((row) => row.product_id === productId) ?? null;
  }, [equipped.figur, purchases]);

  const progress = levelProgress(wallet);
  const themeMeta = themeKey ? THEME_META[themeKey] : null;

  if (!ready && loading) return <Spinner label="Öppnar Halloween…" />;

  if (!ready && error) {
    return (
      <Card title="Kunde inte öppna Halloween">
        <p>{error}</p>
        <Button onClick={() => void reload()}>Försök igen</Button>
      </Card>
    );
  }

  // Hela området är avstängt: Elda Skola visas som vanligt, och temat sätts
  // aldrig på dokumentet (se HalloweenProvider). Inget data tas bort.
  if (!halloweenEnabled) {
    return (
      <div className="stack">
        <Card title="Halloween är avstängt" subtitle="Skolan har stängt av Halloween just nu.">
          <p style={{ marginBottom: 10 }}>
            Du kan inte öppna Halloween-området, byta tema eller använda säsongens
            föremål medan det är avstängt. Elda Skola visas i sin vanliga design, och
            allt du har samlat finns kvar när skolan slår på Halloween igen.
          </p>
          <Badge tone="amber">Tillfälligt avstängt</Badge>
        </Card>
      </div>
    );
  }

  return (
    <div className="halloween-page">
      <section className="halloween-hero" aria-labelledby="halloween-title">
        <div className="halloween-hero-glow" aria-hidden />
        <div className="halloween-hero-inner">
          <div className="halloween-hero-avatar">
            <div className={`halloween-avatar-frame ${frame ? 'has-frame' : ''}`}>
              <AvatarArt
                look={look}
                parts={parts}
                label={`${name}s Halloween-avatar`}
              />
              {frame?.ornament_key && (
                <span className="halloween-avatar-ornament" aria-hidden>
                  <ProductArt assetKey={frame.ornament_key} size={40} />
                </span>
              )}
            </div>
            {companion?.asset_key && (
              <span className="halloween-hero-companion" title={companion.name}>
                <ProductArt assetKey={companion.asset_key} size={54} />
              </span>
            )}
          </div>

          <div className="halloween-hero-text">
            <span className="halloween-eyebrow">
              <Ghost size={15} aria-hidden /> Säsong 2026
            </span>
            <h1 id="halloween-title">
              Halloween i Elda
              <span className="halloween-hero-name">{name}</span>
            </h1>
            <p>
              Bygg din avatar, samla på dig säsongens föremål och gör ditt eget rum i mörkret.
              Allt du låser upp stannar kvar.
            </p>

            <div className="halloween-hero-badges">
              <Badge tone="green">{wallet.total_xp} XP</Badge>
              <Badge tone="neutral">Nivå {wallet.level}</Badge>
              {badge?.asset_key && (
                <span className="halloween-hero-marke" title={badge.name}>
                  <ProductArt assetKey={badge.asset_key} size={26} />
                  <span>{badge.name}</span>
                </span>
              )}
              <Badge tone={seasonActive ? 'green' : 'amber'}>
                {seasonActive ? 'Säsongen är öppen' : 'Säsongen är stängd'}
              </Badge>
            </div>

            <div className="halloween-level">
              <div className="halloween-level-top">
                <span>
                  Nivå {wallet.level} → {wallet.level + 1}
                </span>
                <span className="small muted">
                  {wallet.total_xp} / {wallet.next_level_xp} XP
                </span>
              </div>
              <div
                className="halloween-level-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="Framsteg till nästa nivå"
              >
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="small muted">
                {collection.length} föremål i samlingen · {room.length} av 6 platser i rummet ·
                XP får du när lärare godkänner inlämningar.
              </p>
            </div>
          </div>

          <div className="halloween-hero-theme">
            <span className="halloween-theme-title">
              <Palette size={16} aria-hidden /> Tema
            </span>
            <label className="halloween-switch">
              <input
                type="checkbox"
                checked={freeTheme}
                onChange={(event) => setFreeTheme(event.target.checked)}
              />
              <span aria-hidden className="halloween-switch-track" />
              <span>Värm upp färgerna</span>
            </label>
            <p className="small muted">
              {themeProduct
                ? `Ditt köpta tema ”${themeProduct.name}” styr färgerna.`
                : themeMeta
                  ? themeMeta.description
                  : 'Slår du på säsongstemat blir knappar och detaljer varma – appens vanliga färger ligger kvar.'}
            </p>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {themeProduct && (
                <Button size="sm" variant="ghost" onClick={() => void activateTheme(null)}>
                  Stäng av köpt tema
                </Button>
              )}
              {shopEnabled && (
                <Button size="sm" variant="secondary" onClick={() => setTab('shop')}>
                  <Moon size={14} aria-hidden /> Teman i shopen
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="halloween-hero-particles" aria-hidden>
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} className={`halloween-particle particle-${index}`} />
          ))}
        </div>
      </section>

      <div className="halloween-tabs" role="tablist" aria-label="Halloween">
        {tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={activeTab === row.id}
            className={`halloween-tab ${activeTab === row.id ? 'is-active' : ''}`}
            onClick={() => setTab(row.id)}
          >
            {row.icon}
            {row.label}
            {row.id === 'collection' && collection.length > 0 && (
              <span className="halloween-tab-count">{collection.length}</span>
            )}
          </button>
        ))}
      </div>

      {!seasonActive && (
        <div className="halloween-notice is-info" role="status">
          <Moon size={17} aria-hidden />
          <span>
            Säsongen är inte öppen just nu. Föremål som hör till säsongen går inte att köpa förrän
            den är aktiv igen, men allt du redan äger finns kvar.
          </span>
        </div>
      )}

      {activeTab === 'shop' && shopEnabled && (
        <HalloweenShop
          onOpenAvatar={avatarsEnabled ? () => setTab('avatar') : undefined}
          onOpenRoom={() => setTab('room')}
        />
      )}
      {activeTab === 'avatar' && avatarsEnabled && (
        <AvatarStudio onOpenShop={shopEnabled ? () => setTab('shop') : undefined} />
      )}
      {activeTab === 'collection' && (
        <HalloweenCollection
          onOpenShop={shopEnabled ? () => setTab('shop') : undefined}
          onOpenAvatar={avatarsEnabled ? () => setTab('avatar') : undefined}
          onOpenRoom={() => setTab('room')}
        />
      )}
      {activeTab === 'room' && (
        <HalloweenRoom onOpenShop={shopEnabled ? () => setTab('shop') : undefined} />
      )}

      <section className="halloween-tips" aria-label="Så funkar Halloween">
        <Card title="Så funkar det" subtitle="Tre steg, och allt sparas på ditt konto.">
          <ol className="halloween-steps">
            <li>
              <Wand2 size={18} aria-hidden />
              <div>
                <strong>Bygg avataren</strong>
                <p className="small muted">
                  Välj hudton, hår, kläder och scen. Prova delar innan du köper dem.
                </p>
              </div>
            </li>
            <li>
              <Sparkles size={18} aria-hidden />
              <div>
                <strong>Tjäna XP</strong>
                <p className="small muted">
                  XP kommer från godkända inlämningar. Saldot räknas alltid på servern.
                </p>
              </div>
            </li>
            <li>
              <Trees size={18} aria-hidden />
              <div>
                <strong>Inred rummet</strong>
                <p className="small muted">
                  Ställ ut dekorationer på rummets sex platser. De finns kvar nästa gång.
                </p>
              </div>
            </li>
          </ol>
        </Card>
      </section>

      {products.length === 0 && (
        <p className="small muted">
          Inga säsongsföremål är publicerade just nu. Katalogen fylls på när säsongen öppnar.
        </p>
      )}

      {error && (
        <p className="small muted">
          {error}{' '}
          <button type="button" className="halloween-link" onClick={() => void reload()}>
            Försök igen
          </button>
        </p>
      )}
    </div>
  );
};
