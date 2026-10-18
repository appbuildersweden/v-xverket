import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Filter, Lock, Package, ShoppingBag, Sparkles, X, Zap } from 'lucide-react';
import { EmptyState, LoadingState, SectionCard } from '../../components/ui';
import { ProductArt } from '../../components/shop/ProductArt';
import { ThemePreview } from '../../components/shop/ThemePreview';
import { useCosmetics } from '../../lib/cosmetics';
import { PanelType } from '../../lib/nav';
import {
  EQUIP_KIND_LABELS,
  filterProductViews,
  priceBounds,
  purchaseBlockReason,
  ProductView,
  SHOP_SORTS,
  ShopFilters,
  ShopSort,
  sortProductViews,
  viewProduct,
} from '../../lib/shop';
import {
  CATEGORY_META,
  RARITY_META_SHOP,
  SHOP_CATEGORIES,
  SHOP_RARITIES,
  ShopCategory,
  ShopRarity,
} from '../../lib/shop-catalog';

interface Props {
  panel: PanelType;
}

/**
 * Shop.
 *
 * Sidan visar produkterna som servern har publicerat, vad de kostar och vad
 * eleven kan göra med dem. Den räknar ut tillståndet för varje produkt — ägd,
 * använd, för dyr, kräver högre nivå, utanför säsong eller utgången — och
 * förklarar alltid varför ett köp inte går igenom i stället för att bara stänga
 * av knappen. Själva köpet görs av servern.
 */
export const ShopPage: React.FC<Props> = ({ panel }) => {
  const { products, seasons, purchases, equipped, xp, ready, error, purchase, equip, unequip, refresh } =
    useCosmetics();

  // Saldot ska vara det som gäller just nu. Att öppna shopen hämtar därför
  // kontots siffror igen — annars kunde en elev som just bockat av en uppgift se
  // ett gammalt XP-saldo och tro att köpet inte går igenom.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [category, setCategory] = useState<ShopCategory | 'alla'>('alla');
  const [rarity, setRarity] = useState<ShopRarity | 'alla'>('alla');
  const [season, setSeason] = useState<string | 'alla'>('alla');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [query, setQuery] = useState('');
  const [onlyBuyable, setOnlyBuyable] = useState(false);
  const [sort, setSort] = useState<ShopSort>('pris-upp');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'fel'; text: string } | null>(null);

  const now = useMemo(() => new Date(), []);
  const seasonById = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const ownedIds = useMemo(
    () => new Set(purchases.map((p) => p.product_id).filter((id): id is string => Boolean(id))),
    [purchases],
  );
  const ownedSlugs = useMemo(() => new Set(purchases.map((p) => p.product_slug)), [purchases]);
  const equippedIds = useMemo(
    () => new Set(Object.values(equipped).filter((id): id is string => Boolean(id))),
    [equipped],
  );

  const totalXp = xp?.totalXp ?? 0;
  const xpPerLevel = xp?.xpPerLevel ?? 100;

  const views = useMemo(
    () =>
      products
        .filter((product) => product.published || ownedIds.has(product.id) || ownedSlugs.has(product.slug))
        .map((product) =>
          viewProduct(product, {
            totalXp,
            xpPerLevel,
            ownedIds,
            ownedSlugs,
            equippedIds,
            seasonById,
            now,
          }),
        ),
    [products, totalXp, xpPerLevel, ownedIds, ownedSlugs, equippedIds, seasonById, now],
  );

  const bounds = useMemo(() => priceBounds(products), [products]);

  const filtered = useMemo(() => {
    const parsed = maxPrice.trim() === '' ? null : Number(maxPrice);
    const filters: ShopFilters = {
      category,
      rarity,
      season,
      maxPrice: Number.isFinite(parsed) && parsed !== null ? parsed : null,
      query,
    };
    const visible = filterProductViews(views, filters).filter((view) =>
      onlyBuyable ? view.buyable : true,
    );
    return sortProductViews(visible, sort);
  }, [views, category, rarity, season, maxPrice, query, onlyBuyable, sort]);

  const selected = selectedId ? views.find((view) => view.product.id === selectedId) ?? null : null;

  const resetFilters = () => {
    setCategory('alla');
    setRarity('alla');
    setSeason('alla');
    setMaxPrice('');
    setQuery('');
    setOnlyBuyable(false);
  };

  const runPurchase = async (view: ProductView) => {
    if (busy) return;
    setNotice(null);

    // Klienten försöker aldrig köpa något som saknar XP eller nivå — den
    // förklarar i stället varför. Servern prövar samma regler en gång till.
    const reason = purchaseBlockReason(view);
    if (reason) {
      setNotice({ tone: 'fel', text: reason });
      return;
    }

    setBusy(true);
    const result = await purchase(view.product.id);
    setBusy(false);

    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }

    setNotice({
      tone: 'ok',
      text: result.data.already
        ? `${result.data.name} var redan köpt — inga XP drogs om.`
        : `${result.data.name} är ditt för ${result.data.priceXp} XP. Du har ${result.data.totalXp} XP kvar.`,
    });
  };

  const runEquip = async (view: ProductView) => {
    if (busy) return;
    const kind = view.product.equip_kind;
    if (!kind) {
      setNotice({ tone: 'fel', text: 'Det här föremålet är ett samlarobjekt och kan inte aktiveras.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await equip(view.product.id);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text:
        kind === 'tema'
          ? `${view.product.name} används nu i hela appen. Det kostade inga XP.`
          : `${view.product.name} används nu som ${EQUIP_KIND_LABELS[kind]}. Det kostade inga XP.`,
    });
  };

  const runUnequip = async (view: ProductView) => {
    if (busy) return;
    const kind = view.product.equip_kind;
    if (!kind) return;
    setBusy(true);
    setNotice(null);
    const result = await unequip(kind);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text:
        kind === 'tema'
          ? 'Temat är avstängt. Appen använder sitt vanliga utseende igen.'
          : `Du använder inte längre ${view.product.name}.`,
    });
  };

  if (!ready) {
    return (
      <div className="panel-page" data-testid={`page-${panel}-shop`}>
        <LoadingState label="Hämtar shopen…" />
      </div>
    );
  }

  return (
    <div className="panel-page" data-testid={`page-${panel}-shop`}>
      <div className="sh-header">
        <div className="sh-saldo" data-testid="shop-saldo">
          <Zap size={22} aria-hidden="true" />
          <div>
            <div className="sh-saldo-varde">{totalXp}</div>
            <div className="sh-saldo-etikett">XP att handla för</div>
          </div>
          <div className="sh-saldo-niva">
            Nivå {xp?.level ?? 1}
            {xp ? ` · ${xp.intoLevel} av ${xp.xpPerLevel} XP till nästa nivå` : ''}
          </div>
        </div>
        <div className="sh-saldo" data-testid="shop-agda">
          <Package size={20} aria-hidden="true" />
          <div>
            <div className="sh-saldo-varde">{purchases.length}</div>
            <div className="sh-saldo-etikett">Ägda föremål</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="state-note state-note-error" role="status" data-testid="shop-partial">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <SectionCard title="Sök i shopen" subtitle="Filtrera på kategori, sällsynthet, säsong och pris">
        <div className="sh-filter">
          <div className="field">
            <label htmlFor="shop-kategori">Kategori</label>
            <select
              id="shop-kategori"
              value={category}
              onChange={(e) => setCategory(e.target.value as ShopCategory | 'alla')}
            >
              <option value="alla">Alla kategorier</option>
              {SHOP_CATEGORIES.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shop-raritet">Sällsynthet</label>
            <select
              id="shop-raritet"
              value={rarity}
              onChange={(e) => setRarity(e.target.value as ShopRarity | 'alla')}
            >
              <option value="alla">Alla grader</option>
              {SHOP_RARITIES.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shop-sasong">Säsong</label>
            <select id="shop-sasong" value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="alla">Alla säsonger</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shop-pris">Högst pris (XP)</label>
            <input
              id="shop-pris"
              className="input"
              type="number"
              min={bounds.min}
              max={bounds.max}
              placeholder={`${bounds.min}–${bounds.max}`}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="shop-sortering">Sortering</label>
            <select
              id="shop-sortering"
              value={sort}
              onChange={(e) => setSort(e.target.value as ShopSort)}
            >
              {SHOP_SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shop-sok">Sök</label>
            <input
              id="shop-sok"
              className="input"
              type="search"
              placeholder="Namn eller beskrivning"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`btn ${onlyBuyable ? 'btn-primary' : 'btn-outline'}`}
            aria-pressed={onlyBuyable}
            onClick={() => setOnlyBuyable((value) => !value)}
          >
            <Filter size={15} /> Bara sådant jag kan köpa
          </button>

          <button type="button" className="btn btn-outline sh-filter-reset" onClick={resetFilters}>
            <X size={15} /> Rensa filter
          </button>
        </div>

        <div className="sh-kategorier" role="group" aria-label="Kategorier">
          <button
            type="button"
            className="sh-kategori"
            aria-pressed={category === 'alla'}
            onClick={() => setCategory('alla')}
          >
            Alla <span className="sh-kategori-antal">{views.length}</span>
          </button>
          {SHOP_CATEGORIES.map((meta) => {
            const count = views.filter((view) => view.product.category === meta.id).length;
            return (
              <button
                key={meta.id}
                type="button"
                className="sh-kategori"
                aria-pressed={category === meta.id}
                title={meta.description}
                onClick={() => setCategory(meta.id)}
              >
                {meta.label} <span className="sh-kategori-antal">{count}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {notice && (
        <div
          className="sh-forklaring"
          data-ton={notice.tone}
          role="status"
          data-testid="shop-notice"
        >
          {notice.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {notice.text}
        </div>
      )}

      <SectionCard
        title="Produkter"
        subtitle={`${filtered.length} av ${views.length} produkter visas`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={22} />}
            title="Inga produkter matchar filtret"
            description="Prova ett bredare filter, eller rensa filtren för att se hela shopen."
          />
        ) : (
          <div className="sh-grid">
            {filtered.map((view) => (
              <button
                key={view.product.id}
                type="button"
                className="card sh-kort"
                data-state={view.state}
                data-testid={`shop-produkt-${view.product.slug}`}
                onClick={() => {
                  setSelectedId(view.product.id);
                  setNotice(null);
                }}
              >
                <span className="sh-kort-bild">
                  <ProductArt
                    category={view.product.category}
                    assetKey={view.product.asset_key}
                    themeKey={view.product.theme_key}
                    alt={view.product.name}
                  />
                </span>
                <span className="sh-kort-kropp">
                  <span className="sh-kort-namn">{view.product.name}</span>
                  <span
                    className="sh-raritet"
                    data-raritet={view.product.rarity}
                    title={RARITY_META_SHOP[view.product.rarity].description}
                  >
                    {RARITY_META_SHOP[view.product.rarity].label}
                  </span>
                  <span className="sh-kort-beskrivning">{view.product.description}</span>
                  <span className="sh-kort-rad">
                    <span
                      className={`sh-pris ${view.xpMissing > 0 && !view.owned ? 'sh-pris-otillrackligt' : ''}`}
                    >
                      <Zap size={14} /> {view.product.price_xp} XP
                    </span>
                    <span className="sh-status" data-state={view.state}>
                      {view.state === 'level' && <Lock size={11} />}
                      {view.label}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selected && (
        <ProductDialog
          view={selected}
          busy={busy}
          totalXp={totalXp}
          notice={notice}
          onClose={() => {
            setSelectedId(null);
            setNotice(null);
          }}
          onPurchase={() => void runPurchase(selected)}
          onEquip={() => void runEquip(selected)}
          onUnequip={() => void runUnequip(selected)}
        />
      )}
    </div>
  );
};

interface DialogProps {
  view: ProductView;
  busy: boolean;
  totalXp: number;
  notice: { tone: 'ok' | 'fel'; text: string } | null;
  onClose: () => void;
  onPurchase: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}

/** Detaljvyn: bild, beskrivning, pris, nivåkrav och köp/aktivering. */
const ProductDialog: React.FC<DialogProps> = ({
  view,
  busy,
  totalXp,
  notice,
  onClose,
  onPurchase,
  onEquip,
  onUnequip,
}) => {
  const { product } = view;
  const categoryMeta = CATEGORY_META[product.category];
  const blockReason = purchaseBlockReason(view);
  const kind = product.equip_kind;

  return (
    <div className="sh-dialog-backdrop" role="presentation">
      <div
        className="sh-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        data-testid="shop-dialog"
      >
        <div>
          {product.category === 'tema' && product.theme_key ? (
            <ThemePreview themeKey={product.theme_key} name={product.name} active={view.equipped} />
          ) : (
            <div className="sh-dialog-bild">
              <ProductArt
                category={product.category}
                assetKey={product.asset_key}
                themeKey={product.theme_key}
                alt={product.name}
                size={120}
              />
            </div>
          )}
        </div>

        <div className="sh-dialog-info">
          <h3>{product.name}</h3>
          <p>{product.description}</p>

          <div className="sh-dialog-meta">
            <span className="sh-raritet" data-raritet={product.rarity}>
              {RARITY_META_SHOP[product.rarity].label}
            </span>
            <span className="pill">{categoryMeta?.label}</span>
            <span className="pill">
              <Zap size={12} /> {product.price_xp} XP
            </span>
            {product.min_level > 1 && <span className="pill">Kräver nivå {product.min_level}</span>}
            {product.season_only && <span className="pill">Säsongsföremål</span>}
            <span className="sh-status" data-state={view.state}>
              {view.label}
            </span>
          </div>

          {kind && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Används som {EQUIP_KIND_LABELS[kind]} och kan bytas hur ofta du vill — det kostar
              aldrig XP att aktivera eller byta.
            </p>
          )}

          {notice && (
            <div className="sh-forklaring" data-ton={notice.tone} role="status">
              {notice.tone === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />} {notice.text}
            </div>
          )}

          {!notice && blockReason && (
            <div className="sh-forklaring" data-ton="fel" data-testid="shop-hinder">
              {blockReason}
            </div>
          )}

          {!view.owned && view.xpMissing > 0 && (
            <div className="sh-forklaring">
              Du har {totalXp} XP och behöver {product.price_xp} XP. {view.xpMissing} XP återstår —
              varje avklarad uppgift ger 10 XP.
            </div>
          )}

          <div className="sh-dialog-actions">
            {!view.owned && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || Boolean(blockReason)}
                onClick={onPurchase}
                data-testid="shop-kop"
              >
                <ShoppingBag size={16} />{' '}
                {busy ? 'Köper…' : `Köp för ${product.price_xp} XP`}
              </button>
            )}

            {view.owned && kind && !view.equipped && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={onEquip}
                data-testid="shop-aktivera"
              >
                <Sparkles size={16} /> {kind === 'tema' ? 'Aktivera temat' : 'Använd'}
              </button>
            )}

            {view.owned && kind && view.equipped && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={onUnequip}
                data-testid="shop-avaktivera"
              >
                {kind === 'tema' ? 'Stäng av temat' : `Sluta använda som ${EQUIP_KIND_LABELS[kind]}`}
              </button>
            )}

            {view.owned && !kind && (
              <span className="pill">Samlarobjekt — kan inte aktiveras</span>
            )}

            <button type="button" className="btn btn-outline" onClick={onClose}>
              Stäng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
