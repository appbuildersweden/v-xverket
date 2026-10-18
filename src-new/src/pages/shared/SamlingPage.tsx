import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, PackageCheck, ShoppingBag, Sparkles } from 'lucide-react';
import { EmptyState, LoadingState, SectionCard } from '../../components/ui';
import { ProductArt } from '../../components/shop/ProductArt';
import { useCosmetics } from '../../lib/cosmetics';
import { PanelType } from '../../lib/nav';
import { categoryLabel } from '../../lib/cosmetics';
import { CollectionItem, EQUIP_KIND_LABELS } from '../../lib/shop';
import { RARITY_META_SHOP, SHOP_CATEGORIES, ShopCategory } from '../../lib/shop-catalog';

interface Props {
  panel: PanelType;
  /** Öppnar shopen från tomläget. */
  onNavigate?: (pageId: string) => void;
}

/**
 * Samlingen: allt eleven äger.
 *
 * Här finns även föremål som inte längre säljs — köpet ligger kvar med sin egen
 * kopia av namn, pris och utseende, så en avpublicerad produkt försvinner aldrig
 * ur elevens samling. Varje föremål visar om det kan användas, om det används
 * just nu, eller om det bara är ett samlarobjekt.
 */
export const SamlingPage: React.FC<Props> = ({ panel, onNavigate }) => {
  const { collection, ready, error, equip, unequip, activateTheme, refresh } = useCosmetics();

  // Samlingen läses om när den öppnas, så att ett köp som gjorts i en annan
  // flik eller en utrustning som ändrats någon annanstans syns direkt.
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const [filter, setFilter] = useState<ShopCategory | 'alla'>('alla');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'fel'; text: string } | null>(null);

  const items = useMemo(() => {
    const list = [...collection].sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      return a.name.localeCompare(b.name, 'sv');
    });
    return filter === 'alla' ? list : list.filter((item) => item.category === filter);
  }, [collection, filter]);

  const countFor = (category: ShopCategory) =>
    collection.filter((item) => item.category === category).length;

  const handleToggle = async (item: CollectionItem) => {
    if (!item.equipKind || !item.productId) return;
    setBusyId(item.id);
    setNotice(null);

    const result = item.equipped
      ? await unequip(item.equipKind)
      : item.equipKind === 'tema'
        ? await activateTheme(item.productId)
        : await equip(item.productId);

    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text: item.equipped
        ? `${item.name} används inte längre.`
        : `${item.name} används nu${item.equipKind === 'tema' ? ' i hela appen' : ` som ${EQUIP_KIND_LABELS[item.equipKind]}`}.`,
    });
  };

  if (!ready) {
    return (
      <div className="panel-page" data-testid={`page-${panel}-samling`}>
        <LoadingState label="Hämtar samlingen…" />
      </div>
    );
  }

  return (
    <div className="panel-page" data-testid={`page-${panel}-samling`}>
      {error && (
        <div className="state-note state-note-error" role="status">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {notice && (
        <div className="sh-forklaring" data-ton={notice.tone} role="status" data-testid="samling-notice">
          {notice.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {notice.text}
        </div>
      )}

      <SectionCard
        title="Min samling"
        subtitle={`${collection.length} ägda föremål · ${collection.filter((item) => item.equipped).length} används just nu`}
      >
        <div className="sh-kategorier" role="group" aria-label="Filtrera samlingen">
          <button
            type="button"
            className="sh-kategori"
            aria-pressed={filter === 'alla'}
            onClick={() => setFilter('alla')}
          >
            Alla <span className="sh-kategori-antal">{collection.length}</span>
          </button>
          {SHOP_CATEGORIES.map((meta) => (
            <button
              key={meta.id}
              type="button"
              className="sh-kategori"
              aria-pressed={filter === meta.id}
              onClick={() => setFilter(meta.id)}
            >
              {meta.label} <span className="sh-kategori-antal">{countFor(meta.id)}</span>
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<PackageCheck size={22} />}
            title={collection.length === 0 ? 'Samlingen är tom' : 'Inget i den här kategorin'}
            description={
              collection.length === 0
                ? 'När du köper ett föremål i shopen hamnar det här, och stannar kvar även om det slutar säljas.'
                : 'Prova en annan kategori, eller öppna shopen för att hitta något nytt.'
            }
            action={
              collection.length === 0 && onNavigate ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onNavigate('shop')}
                >
                  <ShoppingBag size={16} /> Öppna shopen
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="sh-samling-grid">
            {items.map((item) => {
              const badge = item.equipKind
                ? item.equipped
                  ? 'Används'
                  : 'Kan användas'
                : 'Samlarobjekt';
              return (
                <article
                  key={item.id}
                  className="sh-samling-kort"
                  data-equipped={item.equipped}
                  data-testid={`samling-${item.slug}`}
                >
                  <div className="sh-samling-bild">
                    <ProductArt
                      category={item.category}
                      assetKey={item.assetKey}
                      themeKey={item.themeKey}
                      alt={item.name}
                      size={64}
                    />
                  </div>
                  <div className="sh-samling-namn">{item.name}</div>
                  <div className="sh-samling-meta">
                    {categoryLabel(item.category)} · {RARITY_META_SHOP[item.rarity].label}
                  </div>
                  <div className="sh-samling-meta">
                    {item.equipKind ? 'Används som ' + EQUIP_KIND_LABELS[item.equipKind] : 'Bara ett samlarobjekt'}
                    {!item.stillForSale ? ' · säljs inte längre' : ''}
                  </div>
                  <div className="sh-kort-rad">
                    <span className="pill">{badge}</span>
                    {item.equipKind && item.productId && (
                      <button
                        type="button"
                        className={`btn btn-sm ${item.equipped ? 'btn-outline' : 'btn-primary'}`}
                        disabled={busyId === item.id}
                        onClick={() => void handleToggle(item)}
                      >
                        <Sparkles size={14} />
                        {item.equipped ? 'Sluta använda' : 'Använd'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <p className="security-note">
        <PackageCheck size={14} aria-hidden="true" />
        Ägandet ligger på ditt konto i databasen. Att byta tema eller utrustning kostar aldrig XP,
        och att en produkt slutar säljas tar aldrig bort något du redan äger.
      </p>
    </div>
  );
};
