import React, { useMemo, useState } from 'react';
import { CalendarRange, Eye, EyeOff, Pencil, Plus, Search, ShoppingBag, Sparkles } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  adminSaveProduct,
  adminSaveSeason,
  adminSetProductPublished,
  CATEGORIES,
  CATEGORY_META,
  listSeasons,
  listShopProducts,
  RARITIES,
  RARITY_META,
  SHOP_ICON_KEYS,
  type ShopCategory,
  type ShopProduct,
  type ShopRarity,
  type ShopSeason,
} from '../../lib/shop';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
  Stat,
} from '../../components/ui';
import { ProductArt } from '../../components/halloween/ProductArt';

const slugify = (value: string) =>
  value
    .toLocaleLowerCase('sv')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Butikens administration.
 *
 * Föremålen ligger i `shop_products` och sparas genom `admin_shop_save_product`,
 * som kontrollerar roll, kategori, pris och nivåkrav på servern. Att
 * avpublicera ett föremål döljer det i butiken men rör aldrig någons köp.
 */
export const AdminShop: React.FC = () => {
  const state = useAsync(async () => {
    const [products, seasons] = await Promise.all([listShopProducts(), listSeasons()]);
    return { products, seasons };
  }, []);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ShopCategory | 'alla'>('alla');
  const [status, setStatus] = useState<'alla' | 'publicerade' | 'dolda'>('alla');
  const [editing, setEditing] = useState<ShopProduct | 'new' | null>(null);
  const [seasonEditing, setSeasonEditing] = useState<ShopSeason | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = state.data?.products ?? [];
  const seasons = state.data?.seasons ?? [];

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('sv');
    return products.filter((row) => {
      if (category !== 'alla' && row.category !== category) return false;
      if (status === 'publicerade' && !row.published) return false;
      if (status === 'dolda' && row.published) return false;
      if (!text) return true;
      return `${row.name} ${row.slug} ${row.description ?? ''}`
        .toLocaleLowerCase('sv')
        .includes(text);
    });
  }, [category, products, query, status]);

  const published = products.filter((row) => row.published).length;
  const seasonal = products.filter((row) => row.season_only).length;
  const seasonName = (id: string | null) =>
    (id && seasons.find((season) => season.id === id)?.name) || '';

  const toggle = async (row: ShopProduct) => {
    setBusyId(row.id);
    setError(null);
    try {
      await adminSetProductPublished(row.id, !row.published);
      setNotice(
        row.published
          ? `”${row.name}” är avpublicerat. De som redan äger det behåller det.`
          : `”${row.name}” syns nu i butiken.`,
      );
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publiceringen kunde inte ändras.');
    } finally {
      setBusyId(null);
    }
  };

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
        description="Alla föremål eleverna kan köpa för XP. Priser, nivåkrav och sällsynthet ändras här – ingen kod behöver skrivas om."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Nytt föremål
          </Button>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid-4">
        <Stat label="Föremål" value={products.length} hint="I katalogen" />
        <Stat label="Publicerade" value={published} hint="Syns i butiken" tone="green" />
        <Stat label="Dolda" value={products.length - published} hint="Bara för admin" />
        <Stat label="Säsongsföremål" value={seasonal} hint="Bara medan säsongen är aktiv" />
      </div>

      <Card
        title="Katalogen"
        subtitle="Sök eller filtrera. Avpublicerade föremål syns bara här."
      >
        <div className="filter-bar" style={{ marginBottom: 12 }}>
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
          <select
            className="input"
            style={{ maxWidth: 200 }}
            aria-label="Filtrera på kategori"
            value={category}
            onChange={(event) => setCategory(event.target.value as ShopCategory | 'alla')}
          >
            <option value="alla">Alla kategorier</option>
            {CATEGORIES.map((row) => (
              <option key={row} value={row}>
                {CATEGORY_META[row].plural}
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ maxWidth: 200 }}
            aria-label="Filtrera på status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'alla' | 'publicerade' | 'dolda')}
          >
            <option value="alla">Alla statusar</option>
            <option value="publicerade">Publicerade</option>
            <option value="dolda">Dolda</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={22} />}
            title="Inga föremål matchar"
            description="Prova ett annat filter, eller skapa ett nytt föremål."
          />
        ) : (
          <div className="list">
            {visible.map((row) => (
              <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <ProductArt
                  assetKey={row.asset_key}
                  themeKey={row.theme_key}
                  rarity={row.rarity}
                  size={44}
                />
                <div className="list-main">
                  <p className="list-title">
                    {row.name}{' '}
                    <Badge tone={RARITY_META[row.rarity].tone}>
                      {RARITY_META[row.rarity].label}
                    </Badge>{' '}
                    {row.published ? (
                      <Badge tone="green">Publicerad</Badge>
                    ) : (
                      <Badge tone="neutral">Dold</Badge>
                    )}
                  </p>
                  <p className="list-sub">
                    {CATEGORY_META[row.category].label} · {row.price_xp} XP · nivå {row.min_level}
                    {row.season_id ? ` · ${seasonName(row.season_id)}` : ''}
                    {row.season_only ? ' · bara under säsong' : ''}
                  </p>
                  {row.description && <p className="list-sub">{row.description}</p>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={14} />}
                    onClick={() => setEditing(row)}
                  >
                    Redigera
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={row.published ? <EyeOff size={14} /> : <Eye size={14} />}
                    loading={busyId === row.id}
                    onClick={() => void toggle(row)}
                  >
                    {row.published ? 'Dölj' : 'Publicera'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Säsonger"
        subtitle="Säsongsföremål går bara att köpa medan säsongen är aktiv. Datumen jämförs med serverns klocka."
        action={
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setSeasonEditing('new')}>
            Ny säsong
          </Button>
        }
      >
        {seasons.length === 0 ? (
          <EmptyState
            icon={<CalendarRange size={22} />}
            title="Inga säsonger ännu"
            description="Skapa en säsong om du vill att vissa föremål bara ska gå att köpa under en period."
          />
        ) : (
          <div className="list">
            {seasons.map((season) => (
              <div key={season.id} className="list-row">
                <div className="list-main">
                  <p className="list-title">
                    {season.name}{' '}
                    {season.active ? (
                      <Badge tone="green">Aktiv</Badge>
                    ) : (
                      <Badge tone="neutral">Avstängd</Badge>
                    )}
                  </p>
                  <p className="list-sub">
                    {season.id}
                    {season.starts_at ? ` · från ${season.starts_at.slice(0, 10)}` : ''}
                    {season.ends_at ? ` · till ${season.ends_at.slice(0, 10)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSeasonEditing(season)}>
                  Ändra
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <ProductForm
          row={editing === 'new' ? null : editing}
          seasons={seasons}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Föremålet är sparat.');
            await state.reload();
          }}
        />
      )}

      {seasonEditing && (
        <SeasonForm
          row={seasonEditing === 'new' ? null : seasonEditing}
          onClose={() => setSeasonEditing(null)}
          onSaved={async () => {
            setSeasonEditing(null);
            setNotice('Säsongen är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const ProductForm: React.FC<{
  row: ShopProduct | null;
  seasons: ShopSeason[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ row, seasons, onClose, onSaved }) => {
  const [name, setName] = useState(row?.name ?? '');
  const [slug, setSlug] = useState(row?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(row));
  const [description, setDescription] = useState(row?.description ?? '');
  const [category, setCategory] = useState<ShopCategory>(row?.category ?? 'figur');
  const [rarity, setRarity] = useState<ShopRarity>(row?.rarity ?? 'vanlig');
  const [price, setPrice] = useState(String(row?.price_xp ?? 100));
  const [minLevel, setMinLevel] = useState(String(row?.min_level ?? 1));
  const [seasonId, setSeasonId] = useState(row?.season_id ?? '');
  const [seasonOnly, setSeasonOnly] = useState(row?.season_only ?? false);
  const [assetKey, setAssetKey] = useState(row?.asset_key ?? 'ikon-pumpalykta');
  const [themeKey, setThemeKey] = useState(row?.theme_key ?? '');
  const [published, setPublished] = useState(row?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Föremålet behöver ett namn.');
      return;
    }
    const priceXp = Number(price);
    const level = Number(minLevel);
    if (!Number.isInteger(priceXp) || priceXp < 1 || priceXp > 100000) {
      setError('Priset måste vara 1–100 000 XP.');
      return;
    }
    if (!Number.isInteger(level) || level < 1 || level > 99) {
      setError('Nivåkravet måste vara 1–99.');
      return;
    }
    if (seasonOnly && !seasonId) {
      setError('Välj en säsong om föremålet bara ska säljas under en säsong.');
      return;
    }
    if (category === 'tema' && themeKey.trim().length < 2) {
      setError('Ett tema behöver en temanyckel, t.ex. "pumpa".');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminSaveProduct({
        id: row?.id ?? null,
        slug: slug || slugify(name),
        name: name.trim(),
        description,
        category,
        rarity,
        priceXp,
        minLevel: level,
        seasonId,
        seasonOnly,
        assetKey,
        themeKey: category === 'tema' ? themeKey.trim() : '',
        published,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Föremålet kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={row ? `Redigera ${row.name}` : 'Nytt föremål'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="Namn" htmlFor="prod-name" required>
          <input
            id="prod-name"
            className="input"
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field label="Id (slug)" htmlFor="prod-slug" hint="Används internt. A–z, siffror och bindestreck." required>
          <input
            id="prod-slug"
            className="input"
            maxLength={80}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </Field>
      </div>

      <Field label="Beskrivning" htmlFor="prod-desc">
        <textarea
          id="prod-desc"
          className="input"
          rows={2}
          maxLength={400}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="grid-3">
        <Field label="Kategori" htmlFor="prod-category" required>
          <select
            id="prod-category"
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value as ShopCategory)}
          >
            {CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {CATEGORY_META[key].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sällsynthet" htmlFor="prod-rarity" required>
          <select
            id="prod-rarity"
            className="input"
            value={rarity}
            onChange={(event) => setRarity(event.target.value as ShopRarity)}
          >
            {RARITIES.map((key) => (
              <option key={key} value={key}>
                {RARITY_META[key].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pris (XP)" htmlFor="prod-price" required>
          <input
            id="prod-price"
            className="input"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>
      </div>

      <div className="grid-3">
        <Field label="Nivåkrav" htmlFor="prod-level" hint="1 = alla kan köpa.">
          <input
            id="prod-level"
            className="input"
            inputMode="numeric"
            value={minLevel}
            onChange={(event) => setMinLevel(event.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>
        <Field label="Säsong" htmlFor="prod-season">
          <select
            id="prod-season"
            className="input"
            value={seasonId}
            onChange={(event) => setSeasonId(event.target.value)}
          >
            <option value="">Ingen säsong</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bild" htmlFor="prod-asset" hint="Välj bland ikonerna som finns i paketet.">
          <select
            id="prod-asset"
            className="input"
            value={assetKey}
            onChange={(event) => setAssetKey(event.target.value)}
          >
            {SHOP_ICON_KEYS.map((key) => (
              <option key={key} value={key}>
                {key.replace('ikon-', '').replace(/-/g, ' ')}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="shop-preview">
        <ProductArt assetKey={assetKey} rarity={rarity} size={64} />
        <div>
          <p className="list-title">{name || 'Förhandsvisning'}</p>
          <p className="list-sub">
            {CATEGORY_META[category].label} · {RARITY_META[rarity].label} · {price || 0} XP
          </p>
        </div>
      </div>

      {category === 'tema' && (
        <Field
          label="Temanyckel"
          htmlFor="prod-theme"
          hint="Måste finnas som temafil i appen, t.ex. pumpa, spokhus, midnight."
          required
        >
          <input
            id="prod-theme"
            className="input"
            value={themeKey}
            maxLength={40}
            onChange={(event) => setThemeKey(event.target.value.toLocaleLowerCase('sv').trim())}
          />
        </Field>
      )}

      <label className="shop-toggle">
        <input
          type="checkbox"
          checked={seasonOnly}
          onChange={(event) => setSeasonOnly(event.target.checked)}
        />
        Bara under säsongen
      </label>
      <label className="shop-toggle">
        <input
          type="checkbox"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        Publicerad i butiken
      </label>
      <p className="small muted">
        <Sparkles size={13} aria-hidden /> Ett tema byter hela appens färger. Temanyckeln måste
        redan finnas som temafil – här väljer du bara vilket tema föremålet låser upp.
      </p>
    </Modal>
  );
};

const SeasonForm: React.FC<{
  row: ShopSeason | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ row, onClose, onSaved }) => {
  const [id, setId] = useState(row?.id ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [startsAt, setStartsAt] = useState(row?.starts_at?.slice(0, 10) ?? '');
  const [endsAt, setEndsAt] = useState(row?.ends_at?.slice(0, 10) ?? '');
  const [active, setActive] = useState(row?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const seasonId = id.trim() || slugify(name);
    if (name.trim().length < 2) {
      setError('Säsongen behöver ett namn.');
      return;
    }
    if (!/^[a-z0-9-]{2,40}$/.test(seasonId)) {
      setError('Säsongens id får bara innehålla a–z, siffror och bindestreck.');
      return;
    }
    if (startsAt && endsAt && startsAt >= endsAt) {
      setError('Slutdatumet måste vara efter startdatumet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminSaveSeason({
        id: seasonId,
        name: name.trim(),
        description,
        startsAt: startsAt ? `${startsAt}T00:00:00Z` : '',
        endsAt: endsAt ? `${endsAt}T23:59:59Z` : '',
        active,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Säsongen kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={row ? `Redigera ${row.name}` : 'Ny säsong'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="Namn" htmlFor="season-name" required>
          <input
            id="season-name"
            className="input"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Id" htmlFor="season-id" hint="Lämnas tomt för att skapa av namnet.">
          <input
            id="season-id"
            className="input"
            value={id}
            maxLength={40}
            onChange={(event) => setId(event.target.value.toLocaleLowerCase('sv'))}
          />
        </Field>
      </div>
      <Field label="Beskrivning" htmlFor="season-desc">
        <input
          id="season-desc"
          className="input"
          maxLength={200}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="grid-2">
        <Field label="Startar" htmlFor="season-start">
          <input
            id="season-start"
            className="input"
            type="date"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </Field>
        <Field label="Slutar" htmlFor="season-end">
          <input
            id="season-end"
            className="input"
            type="date"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
      </div>
      <label className="shop-toggle">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Aktiv (säsongens föremål går att köpa)
      </label>
    </Modal>
  );
};
