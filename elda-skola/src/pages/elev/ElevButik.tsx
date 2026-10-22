import React, { useMemo, useState } from 'react';
import { Check, Coins, Lock, Package, Search, ShoppingBag, Sparkles, Undo2 } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  buyProduct,
  CATEGORIES,
  CATEGORY_META,
  categoryCounts,
  equipProduct,
  EQUIP_LABEL,
  filterProducts,
  listMyEquipped,
  listMyPurchases,
  listSeasons,
  listShopProducts,
  loadXp,
  newPurchaseKey,
  purchaseBlocker,
  RARITY_META,
  sortProducts,
  unequipKind,
  type EquipKind,
  type ShopCategory,
  type ShopProduct,
} from '../../lib/shop';
import { shortDate } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageIntro, Spinner, Stat } from '../../components/ui';
import { ProductArt } from '../../components/halloween/ProductArt';
import { usePlatformFeatures } from '../../lib/features';

/** XP per nivå. Samma värde som `reward_settings.xp_per_level` i databasen. */
const XP_PER_LEVEL = 100;

type Filter = 'alla' | ShopCategory | 'mina';

/**
 * Elevens butik.
 *
 * Föremålen hämtas från databasen och köpen går genom `shop_purchase`, som
 * kontrollerar saldo, nivå, säsong och dubbelköp på servern. Knapparna här
 * förklarar bara varför något inte går att köpa ännu – de avgör ingenting.
 */
export const ElevButik: React.FC = () => {
  // Butiken styrs av skolans funktionsväxel. Är den avstängd hämtas ingenting
  // och sidan visar ett tydligt besked i stället – även om eleven går direkt
  // till adressen. Servern stoppar dessutom varje köp.
  const { shop: shopEnabled } = usePlatformFeatures();
  const state = useAsync(
    async () => {
      const [products, purchases, equipped, xp, seasons] = await Promise.all([
        listShopProducts(),
        listMyPurchases(),
        listMyEquipped(),
        loadXp(),
        listSeasons(),
      ]);
      return { products, purchases, equipped, xp, seasons };
    },
    [],
    { enabled: shopEnabled },
  );

  const [filter, setFilter] = useState<Filter>('alla');
  const [query, setQuery] = useState('');
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [confirming, setConfirming] = useState<ShopProduct | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = state.data?.products ?? [];
  const purchases = state.data?.purchases ?? [];
  const equipped = state.data?.equipped ?? [];
  const xp = state.data?.xp ?? { total_xp: 0, level: 1 };
  const seasons = state.data?.seasons ?? [];

  const ownedIds = useMemo(
    () => new Set(purchases.map((row) => row.product_id).filter((id): id is string => Boolean(id))),
    [purchases],
  );
  const equippedByKind = useMemo(() => {
    const map = new Map<EquipKind, string>();
    for (const row of equipped) map.set(row.kind, row.product_id);
    return map;
  }, [equipped]);
  const activeSeasons = useMemo(
    () =>
      seasons
        .filter(
          (season) =>
            season.active &&
            (!season.starts_at || new Date(season.starts_at) <= new Date()) &&
            (!season.ends_at || new Date(season.ends_at) > new Date()),
        )
        .map((season) => season.id),
    [seasons],
  );
  const seasonNames = useMemo(
    () => new Map(seasons.map((season) => [season.id, season.name])),
    [seasons],
  );

  const counts = useMemo(() => categoryCounts(products), [products]);
  const visible = useMemo(() => {
    const list = filter === 'mina' ? products.filter((row) => ownedIds.has(row.id)) : products;
    return sortProducts(
      filterProducts(list, {
        category: filter === 'mina' || filter === 'alla' ? 'alla' : filter,
        query,
        onlyAffordable,
        ownedIds,
        totalXp: xp.total_xp,
      }),
    );
  }, [filter, onlyAffordable, ownedIds, products, query, xp.total_xp]);

  const toNextLevel = XP_PER_LEVEL - (xp.total_xp % XP_PER_LEVEL);
  const ownedProducts = useMemo(
    () =>
      sortProducts(
        purchases
          .map((row) => products.find((product) => product.id === row.product_id))
          .filter((row): row is ShopProduct => Boolean(row)),
      ),
    [products, purchases],
  );

  const buy = async () => {
    if (!confirming) return;
    const product = confirming;
    setBusyId(product.id);
    setError(null);
    try {
      const result = await buyProduct(product.id, newPurchaseKey());
      setConfirming(null);
      setNotice(
        result.already
          ? `Du äger redan ${result.name}.`
          : `${result.name} är ditt! ${result.price_xp} XP drogs och du har ${result.total_xp} XP kvar (nivå ${result.level}).`,
      );
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Köpet kunde inte genomföras.');
      setConfirming(null);
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (product: ShopProduct, on: boolean) => {
    setBusyId(product.id);
    setError(null);
    try {
      const kind = product.equip_kind;
      if (on && kind) {
        await equipProduct(product.id);
        setNotice(`${product.name} används nu.`);
      } else if (kind) {
        await unequipKind(kind);
        setNotice(`${product.name} är avtaget.`);
      }
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ändringen kunde inte sparas.');
    } finally {
      setBusyId(null);
    }
  };

  if (!shopEnabled) {
    return (
      <div className="stack">
        <PageIntro
          eyebrow="Belöningar"
          title="Butiken"
          description="Skolan bestämmer när XP-shoppen är öppen."
        />
        <Card title="Butiken är avstängd" subtitle="Skolan har stängt av XP-shoppen just nu.">
          <p style={{ marginBottom: 10 }}>
            Du kan inte öppna butiken eller köpa något medan den är avstängd. Dina XP,
            din nivå och allt du redan har köpt finns kvar och kommer tillbaka när skolan
            slår på butiken igen.
          </p>
          <Badge tone="amber">Tillfälligt avstängd</Badge>
        </Card>
      </div>
    );
  }

  if (state.loading) return <Spinner label="Hämtar butiken…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Butiken" />
        <Card>
          <EmptyState
            title="Kunde inte hämta butiken"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Belöningar"
        title="Butiken"
        description="Köp teman, figurer, ramar och effekter för XP du redan har tjänat ihop. Priserna är fasta och ingenting kostar pengar."
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="shop-balance">
          <Stat label="Din XP" value={`${xp.total_xp} XP`} hint={`Nivå ${xp.level}`} tone="green" />
          <Stat label="Till nästa nivå" value={`${toNextLevel} XP`} hint="XP från godkända uppgifter" />
          <Stat label="Äger" value={`${ownedProducts.length} föremål`} hint={`${products.length} i butiken`} />
          <div className="shop-balance-art" aria-hidden>
            <ProductArt assetKey="ikon-pumpalykta" rarity="legendarisk" size={78} />
          </div>
        </div>
      </Card>

      <div className="shop-toolbar">
        <div className="chip-row" role="tablist" aria-label="Kategorier">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'alla'}
            className={`chip ${filter === 'alla' ? 'chip-active' : ''}`}
            onClick={() => setFilter('alla')}
          >
            Alla <span>{products.length}</span>
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={filter === category}
              className={`chip ${filter === category ? 'chip-active' : ''}`}
              onClick={() => setFilter(category)}
            >
              {CATEGORY_META[category].plural} <span>{counts[category]}</span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'mina'}
            className={`chip ${filter === 'mina' ? 'chip-active' : ''}`}
            onClick={() => setFilter('mina')}
          >
            Mina föremål <span>{ownedProducts.length}</span>
          </button>
        </div>

        <div className="filter-bar">
          <div className="search-field" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} aria-hidden />
            <input
              className="input"
              placeholder="Sök föremål"
              aria-label="Sök föremål"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="shop-toggle">
            <input
              type="checkbox"
              checked={onlyAffordable}
              onChange={(event) => setOnlyAffordable(event.target.checked)}
            />
            Bara det jag har råd med
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag size={24} />}
            title={
              filter === 'mina'
                ? 'Du har inte köpt något ännu'
                : onlyAffordable
                  ? 'Inget föremål passar filtret'
                  : 'Inga föremål matchar'
            }
            description={
              filter === 'mina'
                ? 'Köp ditt första föremål – XP får du genom godkända uppgifter.'
                : 'Prova ett annat sökord eller visa alla kategorier.'
            }
            action={
              filter !== 'alla' || onlyAffordable ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilter('alla');
                    setQuery('');
                    setOnlyAffordable(false);
                  }}
                >
                  Visa allt
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="shop-grid">
          {visible.map((product) => {
            const owned = ownedIds.has(product.id);
            const kind = product.equip_kind;
            const equippedHere = kind ? equippedByKind.get(kind) === product.id : false;
            const blocker = purchaseBlocker({
              product,
              owned,
              totalXp: xp.total_xp,
              level: xp.level,
              activeSeasons,
            });
            const rarity = RARITY_META[product.rarity];
            return (
              <article
                key={product.id}
                className={`shop-card ${owned ? 'shop-card-owned' : ''} rarity-border-${product.rarity}`}
              >
                <div className="shop-card-art">
                  <ProductArt
                    assetKey={product.asset_key}
                    themeKey={product.theme_key}
                    rarity={product.rarity}
                    size={92}
                    name={product.name}
                  />
                  {owned && (
                    <span className="shop-owned-mark" title="Du äger föremålet">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                <div className="shop-card-body">
                  <div className="shop-card-head">
                    <h3>{product.name}</h3>
                    <Badge tone={rarity.tone}>{rarity.label}</Badge>
                  </div>
                  <p className="shop-card-category">
                    {CATEGORY_META[product.category].label}
                    {kind && EQUIP_LABEL[kind] !== CATEGORY_META[product.category].label
                      ? ` · ${EQUIP_LABEL[kind]}`
                      : ''}
                    {product.season_id && seasonNames.get(product.season_id)
                      ? ` · ${seasonNames.get(product.season_id)}`
                      : ''}
                  </p>
                  {product.description && <p className="shop-card-text">{product.description}</p>}
                  <div className="shop-card-foot">
                    <span className="shop-price">
                      <Coins size={15} aria-hidden /> {product.price_xp} XP
                    </span>
                    {product.min_level > 1 && (
                      <span className="shop-requirement">
                        <Lock size={13} aria-hidden /> Nivå {product.min_level}
                      </span>
                    )}
                  </div>
                  {owned ? (
                    kind ? (
                      <Button
                        size="sm"
                        variant={equippedHere ? 'ghost' : 'primary'}
                        icon={equippedHere ? <Undo2 size={14} /> : <Sparkles size={14} />}
                        loading={busyId === product.id}
                        onClick={() => void equip(product, !equippedHere)}
                      >
                        {equippedHere ? 'Ta av' : 'Använd'}
                      </Button>
                    ) : (
                      <p className="shop-status">
                        <Package size={13} aria-hidden /> I din samling
                      </p>
                    )
                  ) : (
                    <>
                      <Button
                        size="sm"
                        icon={<ShoppingBag size={14} />}
                        disabled={Boolean(blocker) || busyId === product.id}
                        loading={busyId === product.id}
                        onClick={() => {
                          setError(null);
                          setConfirming(product);
                        }}
                      >
                        Köp för {product.price_xp} XP
                      </Button>
                      {blocker && <p className="shop-blocked">{blocker}</p>}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ownedProducts.length > 0 && (
        <Card
          title="Min samling"
          subtitle="Allt du äger. Föremål med en plats kan användas direkt – ett per plats."
        >
          <div className="list">
            {ownedProducts.map((product) => {
              const kind = product.equip_kind;
              const equippedHere = kind ? equippedByKind.get(kind) === product.id : false;
              return (
                <div key={product.id} className="list-row">
                  <ProductArt
                    assetKey={product.asset_key}
                    themeKey={product.theme_key}
                    rarity={product.rarity}
                    size={40}
                  />
                  <div className="list-main">
                    <p className="list-title">{product.name}</p>
                    <p className="list-sub">
                      {CATEGORY_META[product.category].label} · {RARITY_META[product.rarity].label}
                    </p>
                  </div>
                  {kind ? (
                    <Button
                      size="sm"
                      variant={equippedHere ? 'ghost' : 'primary'}
                      loading={busyId === product.id}
                      onClick={() => void equip(product, !equippedHere)}
                    >
                      {equippedHere ? 'Ta av' : 'Använd'}
                    </Button>
                  ) : (
                    <Badge tone="neutral">Samlarobjekt</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {purchases.length > 0 && (
        <p className="small muted">
          Senaste köp: {purchases[0].name} · {shortDate(purchases[0].purchased_at)}. Alla köp ligger kvar
          även om ett föremål tas ur butiken.
        </p>
      )}

      {confirming && (
        <Modal
          open
          title="Bekräfta köp"
          onClose={() => setConfirming(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Avbryt
              </Button>
              <Button loading={busyId === confirming.id} onClick={() => void buy()}>
                Köp för {confirming.price_xp} XP
              </Button>
            </>
          }
        >
          <div className="shop-confirm">
            <ProductArt
              assetKey={confirming.asset_key}
              themeKey={confirming.theme_key}
              rarity={confirming.rarity}
              size={64}
            />
            <div>
              <p className="list-title">{confirming.name}</p>
              <p className="list-sub">
                {RARITY_META[confirming.rarity].label} · {CATEGORY_META[confirming.category].label}
              </p>
            </div>
          </div>
          <p>
            Du betalar <strong>{confirming.price_xp} XP</strong> och har{' '}
            <strong>{xp.total_xp - confirming.price_xp} XP</strong> kvar. Köpet går inte att ångra.
          </p>
        </Modal>
      )}
    </div>
  );
};
