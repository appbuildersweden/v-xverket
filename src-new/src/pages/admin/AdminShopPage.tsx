import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, Pencil, Plus, Save, Store, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, SectionCard } from '../../components/ui';
import { ProductArt } from '../../components/shop/ProductArt';
import { ThemePreview } from '../../components/shop/ThemePreview';
import {
  listAllProducts,
  listSeasons,
  ProductDraft,
  saveProduct,
  saveSeason,
  setProductPublished,
  ShopProduct,
  ShopSeason,
  SeasonDraft,
  validateProductDraft,
} from '../../lib/shop';
import {
  CATEGORY_META,
  RARITY_META_SHOP,
  SHOP_CATEGORIES,
  SHOP_RARITIES,
  ShopCategory,
  ShopRarity,
} from '../../lib/shop-catalog';

/**
 * Shophanteringen i adminpanelen.
 *
 * Allt som rör shopen sköts här: produkter, priser, sällsynthet, nivåkrav,
 * kategori, säsong, bild och publicering — samt säsongerna själva. Inget av
 * detta kräver en ny kodversion; servern sparar raderna och butiken läser dem.
 *
 * Två saker är medvetet tydliga:
 *   * en ändring av pris eller publicering påverkar aldrig redan gjorda köp,
 *     eftersom ägandet ligger i en egen tabell med sin egen kopia,
 *   * servern kontrollerar adminrollen i varje funktion. Sidan är bara
 *     gränssnittet — behörigheten ligger i databasen.
 */

const EMPTY_DRAFT: ProductDraft = {
  slug: '',
  name: '',
  description: '',
  category: 'figur',
  rarity: 'vanlig',
  price_xp: 100,
  min_level: 1,
  season_id: 'halloween',
  season_only: true,
  asset_key: 'ikon-pumpalykta',
  theme_key: '',
  ornament_key: '',
  published: true,
  position: 100,
};

function draftFrom(product: ShopProduct): ProductDraft {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description ?? '',
    category: product.category,
    rarity: product.rarity,
    price_xp: product.price_xp,
    min_level: product.min_level,
    season_id: product.season_id,
    season_only: product.season_only,
    asset_key: product.asset_key ?? '',
    theme_key: product.theme_key ?? '',
    ornament_key: product.ornament_key ?? '',
    published: product.published,
    position: product.position,
  };
}

type Confirmation =
  | { kind: 'pris'; draft: ProductDraft; product: ShopProduct }
  | { kind: 'avpublicera'; product: ShopProduct }
  | { kind: 'sasong'; draft: SeasonDraft; season: ShopSeason };

export const AdminShopPage: React.FC = () => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [seasons, setSeasons] = useState<ShopSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'fel'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [seasonDraft, setSeasonDraft] = useState<SeasonDraft | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ShopCategory | 'alla'>('alla');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [productResult, seasonResult] = await Promise.all([listAllProducts(), listSeasons()]);
    if (!productResult.ok) {
      setLoadError(productResult.error);
      setLoading(false);
      return;
    }
    if (!seasonResult.ok) {
      setLoadError(seasonResult.error);
      setLoading(false);
      return;
    }
    setProducts(productResult.data);
    setSeasons(seasonResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (categoryFilter === 'alla'
        ? products
        : products.filter((product) => product.category === categoryFilter)
      ).slice()
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'sv')),
    [products, categoryFilter],
  );

  const applySave = async (value: ProductDraft) => {
    setBusy(true);
    setFormError(null);
    const result = await saveProduct(value);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setDraft(null);
    setConfirmation(null);
    setNotice({
      tone: 'ok',
      text: `${result.data.name} är sparad. Butiken visar ändringen direkt — befintliga köp är orörda.`,
    });
    await load();
  };

  const submitDraft = async () => {
    if (!draft) return;
    const problem = validateProductDraft(draft);
    if (problem) {
      setFormError(problem);
      return;
    }

    const existing = draft.id ? products.find((product) => product.id === draft.id) : null;
    // Prishöjning eller prissänkning på en produkt som redan säljs kräver ett
    // tydligt ja — det är den ändring som lättast får konsekvenser.
    if (existing && existing.price_xp !== draft.price_xp) {
      setConfirmation({ kind: 'pris', draft, product: existing });
      return;
    }

    await applySave(draft);
  };

  const togglePublished = async (product: ShopProduct) => {
    if (product.published) {
      setConfirmation({ kind: 'avpublicera', product });
      return;
    }
    setBusy(true);
    const result = await setProductPublished(product.id, true);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text: `${product.name} är publicerad igen och syns i shopen.`,
    });
    await load();
  };

  const saveSeasonDraft = async () => {
    if (!seasonDraft) return;
    const season = seasons.find((item) => item.id === seasonDraft.id) ?? null;
    if (season && season.active && !seasonDraft.active) {
      setConfirmation({ kind: 'sasong', draft: seasonDraft, season });
      return;
    }
    await applySeason(seasonDraft);
  };

  const applySeason = async (value: SeasonDraft) => {
    setBusy(true);
    const result = await saveSeason(value);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'fel', text: result.error });
      return;
    }
    setSeasonDraft(null);
    setConfirmation(null);
    setNotice({
      tone: 'ok',
      text: `Säsongen ${result.data.name} är sparad. Elevernas ägda föremål påverkas inte.`,
    });
    await load();
  };

  if (loading) {
    return (
      <div className="panel-page" data-testid="page-admin-shop">
        <LoadingState label="Hämtar shopen…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="panel-page" data-testid="page-admin-shop">
        <ErrorState message={loadError} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="panel-page" data-testid="page-admin-shop">
      {notice && (
        <div
          className="sh-forklaring"
          data-ton={notice.tone}
          role="status"
          data-testid="admin-shop-notice"
        >
          {notice.tone === 'ok' ? <Check size={14} /> : <AlertTriangle size={14} />} {notice.text}
        </div>
      )}

      <SectionCard
        title="Shopens produkter"
        subtitle={`${products.length} produkter · ${products.filter((p) => p.published).length} publicerade`}
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDraft({ ...EMPTY_DRAFT });
              setFormError(null);
            }}
            data-testid="admin-ny-produkt"
          >
            <Plus size={16} /> Ny produkt
          </button>
        }
      >
        <div className="sh-kategorier" role="group" aria-label="Filtrera produkter">
          <button
            type="button"
            className="sh-kategori"
            aria-pressed={categoryFilter === 'alla'}
            onClick={() => setCategoryFilter('alla')}
          >
            Alla <span className="sh-kategori-antal">{products.length}</span>
          </button>
          {SHOP_CATEGORIES.map((meta) => (
            <button
              key={meta.id}
              type="button"
              className="sh-kategori"
              aria-pressed={categoryFilter === meta.id}
              onClick={() => setCategoryFilter(meta.id)}
            >
              {meta.label}{' '}
              <span className="sh-kategori-antal">
                {products.filter((product) => product.category === meta.id).length}
              </span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<Store size={22} />}
            title="Inga produkter i den här kategorin"
            description="Skapa en ny produkt, eller välj en annan kategori."
          />
        ) : (
          visible.map((product) => (
            <div
              className="sh-admin-rad"
              key={product.id}
              data-published={product.published}
              data-testid={`admin-produkt-${product.slug}`}
            >
              <div className="sh-samling-bild" style={{ width: 64, height: 64 }}>
                <ProductArt
                  category={product.category}
                  assetKey={product.asset_key}
                  themeKey={product.theme_key}
                  alt={product.name}
                  size={44}
                />
              </div>
              <div className="sh-admin-rad-info">
                <div className="sh-admin-rad-namn">{product.name}</div>
                <div className="sh-admin-rad-meta">
                  {CATEGORY_META[product.category]?.label} · {product.price_xp} XP ·{' '}
                  {RARITY_META_SHOP[product.rarity].label} · nivå {product.min_level}
                  {product.season_id ? ` · ${product.season_id}` : ''}
                  {product.season_only ? ' (säsong)' : ''} · {product.slug}
                </div>
              </div>
              <span className="sh-status" data-state={product.published ? 'available' : 'unpublished'}>
                {product.published ? 'Publicerad' : 'Avpublicerad'}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setDraft(draftFrom(product));
                  setFormError(null);
                }}
              >
                <Pencil size={14} /> Redigera
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void togglePublished(product)}
                disabled={busy}
              >
                {product.published ? <EyeOff size={14} /> : <Eye size={14} />}{' '}
                {product.published ? 'Avpublicera' : 'Publicera'}
              </button>
            </div>
          ))
        )}
      </SectionCard>

      {draft && (
        <SectionCard
          title={draft.id ? `Redigera ${draft.name || 'produkt'}` : 'Ny produkt'}
          subtitle="Ändringen gäller butiken direkt. Redan gjorda köp behåller sitt pris och sitt ägande."
          action={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft(null)}>
              <X size={14} /> Stäng
            </button>
          }
        >
          <div className="sh-admin-form">
            <div className="field">
              <label htmlFor="shop-form-namn">Namn</label>
              <input
                id="shop-form-namn"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-slug">Id (slug)</label>
              <input
                id="shop-form-slug"
                className="input"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-kategori">Kategori</label>
              <select
                id="shop-form-kategori"
                className="input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ShopCategory })}
              >
                {SHOP_CATEGORIES.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="shop-form-raritet">Sällsynthet</label>
              <select
                id="shop-form-raritet"
                className="input"
                value={draft.rarity}
                onChange={(e) => setDraft({ ...draft, rarity: e.target.value as ShopRarity })}
              >
                {SHOP_RARITIES.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="shop-form-pris">XP-pris</label>
              <input
                id="shop-form-pris"
                className="input"
                type="number"
                min={1}
                max={100000}
                value={draft.price_xp}
                onChange={(e) => setDraft({ ...draft, price_xp: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-niva">Minsta nivå</label>
              <input
                id="shop-form-niva"
                className="input"
                type="number"
                min={1}
                max={99}
                value={draft.min_level}
                onChange={(e) => setDraft({ ...draft, min_level: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-sasong">Säsong</label>
              <select
                id="shop-form-sasong"
                className="input"
                value={draft.season_id ?? ''}
                onChange={(e) => setDraft({ ...draft, season_id: e.target.value || null })}
              >
                <option value="">Ingen säsong</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="shop-form-bild">Bildnyckel (ikon)</label>
              <input
                id="shop-form-bild"
                className="input"
                placeholder="ikon-pumpalykta"
                value={draft.asset_key}
                onChange={(e) => setDraft({ ...draft, asset_key: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-tema">Temanyckel (UI-teman)</label>
              <input
                id="shop-form-tema"
                className="input"
                placeholder="pumpa"
                value={draft.theme_key}
                onChange={(e) => setDraft({ ...draft, theme_key: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-form-ordning">Ordning</label>
              <input
                id="shop-form-ordning"
                className="input"
                type="number"
                value={draft.position}
                onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })}
              />
            </div>
            <div className="field field-wide">
              <label htmlFor="shop-form-beskrivning">Beskrivning</label>
              <textarea
                id="shop-form-beskrivning"
                className="input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={draft.season_only}
                  onChange={(e) => setDraft({ ...draft, season_only: e.target.checked })}
                />{' '}
                Bara under säsongen
              </label>
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                />{' '}
                Publicerad
              </label>
            </div>
          </div>

          {draft.category === 'tema' && draft.theme_key && (
            <div style={{ marginTop: 16 }}>
              <ThemePreview themeKey={draft.theme_key} name={draft.name || 'Temat'} />
            </div>
          )}

          {formError && (
            <div className="sh-forklaring" data-ton="fel" role="alert" data-testid="admin-shop-fel">
              {formError}
            </div>
          )}

          <div className="sh-dialog-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={() => void submitDraft()} disabled={busy}>
              <Save size={16} /> {busy ? 'Sparar…' : 'Spara produkten'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setDraft(null)}>
              Avbryt
            </button>
          </div>
        </SectionCard>
      )}

      {confirmation && (
        <div className="sh-admin-bekraftelse" role="alertdialog" data-testid="admin-shop-bekraftelse">
          {confirmation.kind === 'pris' && (
            <span>
              Ändra priset på <strong>{confirmation.product.name}</strong> från{' '}
              {confirmation.product.price_xp} XP till {confirmation.draft.price_xp} XP? Elever som
              redan har köpt föremålet behåller det och sitt ursprungliga pris.
            </span>
          )}
          {confirmation.kind === 'avpublicera' && (
            <span>
              Avpublicera <strong>{confirmation.product.name}</strong>? Den försvinner ur shopen,
              men alla som äger den behåller den i sin samling.
            </span>
          )}
          {confirmation.kind === 'sasong' && (
            <span>
              Stäng av säsongen <strong>{confirmation.season.name}</strong>? Föremålen slutar säljas
              medan säsongen är avstängd, men ingen förlorar det de redan äger.
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              if (confirmation.kind === 'pris') void applySave(confirmation.draft);
              else if (confirmation.kind === 'avpublicera') {
                void (async () => {
                  setBusy(true);
                  const result = await setProductPublished(confirmation.product.id, false);
                  setBusy(false);
                  setConfirmation(null);
                  if (!result.ok) {
                    setNotice({ tone: 'fel', text: result.error });
                    return;
                  }
                  setNotice({
                    tone: 'ok',
                    text: `${confirmation.product.name} är avpublicerad. Ägda föremål ligger kvar i samlingarna.`,
                  });
                  await load();
                })();
              } else {
                void applySeason(confirmation.draft);
              }
            }}
          >
            Ja, fortsätt
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setConfirmation(null)}
          >
            Avbryt
          </button>
        </div>
      )}

      <SectionCard
        title="Säsonger"
        subtitle="Halloween är den första säsongen. Fler säsonger läggs till som rader — ingen ny kod."
      >
        {seasons.map((season) => (
          <div className="sh-admin-rad" key={season.id} data-testid={`admin-sasong-${season.id}`}>
            <div className="sh-admin-rad-info">
              <div className="sh-admin-rad-namn">
                {season.name} <span className="sh-admin-rad-meta">({season.id})</span>
              </div>
              <div className="sh-admin-rad-meta">
                {season.starts_at ? `Start ${season.starts_at.slice(0, 10)}` : 'Ingen start'} ·{' '}
                {season.ends_at ? `Slut ${season.ends_at.slice(0, 10)}` : 'Inget slut'} ·{' '}
                {products.filter((p) => p.season_id === season.id).length} produkter
              </div>
            </div>
            <span className="sh-status" data-state={season.active ? 'available' : 'unpublished'}>
              {season.active ? 'Aktiv' : 'Avstängd'}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                setSeasonDraft({
                  id: season.id,
                  name: season.name,
                  description: season.description ?? '',
                  starts_at: season.starts_at,
                  ends_at: season.ends_at,
                  active: season.active,
                })
              }
            >
              <Pencil size={14} /> Redigera
            </button>
          </div>
        ))}

        {seasonDraft && (
          <div style={{ marginTop: 14 }}>
            <div className="sh-admin-form">
              <div className="field">
                <label htmlFor="season-namn">Namn</label>
                <input
                  id="season-namn"
                  className="input"
                  value={seasonDraft.name}
                  onChange={(e) => setSeasonDraft({ ...seasonDraft, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="season-start">Start (ISO)</label>
                <input
                  id="season-start"
                  className="input"
                  value={seasonDraft.starts_at ?? ''}
                  onChange={(e) => setSeasonDraft({ ...seasonDraft, starts_at: e.target.value || null })}
                />
              </div>
              <div className="field">
                <label htmlFor="season-slut">Slut (ISO)</label>
                <input
                  id="season-slut"
                  className="input"
                  value={seasonDraft.ends_at ?? ''}
                  onChange={(e) => setSeasonDraft({ ...seasonDraft, ends_at: e.target.value || null })}
                />
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={seasonDraft.active}
                    onChange={(e) => setSeasonDraft({ ...seasonDraft, active: e.target.checked })}
                  />{' '}
                  Säsongen är aktiv
                </label>
              </div>
              <div className="field field-wide">
                <label htmlFor="season-beskrivning">Beskrivning</label>
                <textarea
                  id="season-beskrivning"
                  className="input"
                  value={seasonDraft.description}
                  onChange={(e) => setSeasonDraft({ ...seasonDraft, description: e.target.value })}
                />
              </div>
            </div>
            <div className="sh-dialog-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" onClick={() => void saveSeasonDraft()} disabled={busy}>
                <Save size={16} /> Spara säsongen
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setSeasonDraft(null)}>
                Avbryt
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <p className="security-note">
        <AlertTriangle size={14} aria-hidden="true" />
        Servern kontrollerar adminrollen i varje åtgärd. Att avpublicera en produkt eller stänga en
        säsong rör aldrig `shop_purchases`, så ingen elev förlorar ett föremål den har köpt.
      </p>
    </div>
  );
};
