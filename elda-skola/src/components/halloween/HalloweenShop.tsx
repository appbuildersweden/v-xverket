import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Filter, Lock, Search, ShoppingBag, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal } from '../ui';
import { useHalloween } from '../../lib/halloween-context';
import {
  AVAILABILITY_LABELS,
  CATEGORY_META,
  RARITY_META,
  SORT_LABELS,
  canAfford,
  categoryLabel,
  filterItems,
  isRarity,
  itemStatus,
  slotLabel,
  type Availability,
  type PartSlot,
  type SortMode,
} from '../../lib/halloween-catalog';
import type { HalloweenPart, HalloweenProduct } from '../../lib/halloween';
import AvatarArt from './AvatarArt';
import { PartThumb, ProductArt } from './ProductArt';

/**
 * Halloween-shopen.
 *
 * Två sorters föremål säljs med samma valuta: säsongens produkter (teman,
 * ramar, märken, figurer och effekter) och avatar-delar (hår, kläder, hattar,
 * masker, glasögon, bakgrunder, husdjur och dekorationer). Båda köpen går
 * genom servern, som äger pris, nivåkrav och saldo. Här visas bara det servern
 * har svarat – inget ägande gissas.
 */

type ShopEntry =
  | {
      kind: 'produkt';
      key: string;
      product: HalloweenProduct;
      name: string;
      description: string | null;
      category: string;
      group: string;
      slot: null;
      rarity: string;
      price_xp: number;
      min_level: number;
      owned: boolean;
      equipped: boolean;
      asset_key: string | null;
      theme_key: string | null;
      ornament_key: string | null;
    }
  | {
      kind: 'del';
      key: string;
      part: HalloweenPart;
      name: string;
      description: string | null;
      category: string;
      group: string;
      slot: string;
      rarity: string;
      price_xp: number;
      min_level: number;
      owned: boolean;
      equipped: boolean;
      asset_key: null;
      theme_key: null;
      ornament_key: null;
    };

/** Avatar-ikoner hör till Elda-skrivbordet och säljs inte här. */
const HIDDEN_PRODUCT_CATEGORIES = new Set(['avatar']);

function toEntries(
  products: readonly HalloweenProduct[],
  parts: readonly HalloweenPart[],
  purchases: readonly { product_id: string | null }[],
  ownedParts: ReadonlySet<string>,
  look: Record<string, string>,
  room: readonly { part_slug: string }[],
  equippedProducts: Record<string, string>,
): ShopEntry[] {
  const ownedProductIds = new Set(
    purchases.map((row) => row.product_id).filter((id): id is string => Boolean(id)),
  );
  const equippedIds = new Set(Object.values(equippedProducts));
  const lookSlugs = new Set(Object.values(look));
  const roomSlugs = new Set(room.map((row) => row.part_slug));

  const productEntries: ShopEntry[] = products
    .filter((product) => !HIDDEN_PRODUCT_CATEGORIES.has(product.category))
    .map((product) => ({
      kind: 'produkt',
      key: `p-${product.id}`,
      product,
      name: product.name,
      description: product.description,
      category: product.category,
      group: product.category,
      slot: null,
      rarity: product.rarity,
      price_xp: product.price_xp,
      min_level: product.min_level,
      owned: ownedProductIds.has(product.id),
      equipped: equippedIds.has(product.id),
      asset_key: product.asset_key,
      theme_key: product.theme_key,
      ornament_key: product.ornament_key,
    }));

  const partEntries: ShopEntry[] = parts.map((part) => ({
    kind: 'del',
    key: `d-${part.slug}`,
    part,
    name: part.name,
    description: part.description,
    category: part.slot,
    group: part.slot,
    slot: part.slot,
    rarity: part.rarity,
    price_xp: part.price_xp,
    min_level: part.min_level,
    owned: part.free || ownedParts.has(part.slug),
    equipped:
      part.slot === 'dekoration' ? roomSlugs.has(part.slug) : lookSlugs.has(part.slug),
    asset_key: null,
    theme_key: null,
    ornament_key: null,
  }));

  return [...productEntries, ...partEntries];
}

export const HalloweenShop: React.FC<{
  onOpenAvatar: () => void;
  onOpenRoom: () => void;
}> = ({ onOpenAvatar, onOpenRoom }) => {
  const {
    products,
    parts,
    purchases,
    look,
    room,
    wallet,
    ownedParts,
    purchaseProduct,
    purchasePart,
    activateTheme,
    equipped,
  } = useHalloween();

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('alla');
  const [availability, setAvailability] = useState<Availability>('alla');
  const [sort, setSort] = useState<SortMode>('rekommenderad');
  const [active, setActive] = useState<ShopEntry | null>(null);
  const [tryOn, setTryOn] = useState<Record<string, string> | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const entries = useMemo(
    () => toEntries(products, parts, purchases, ownedParts, look, room, equipped),
    [products, parts, purchases, ownedParts, look, room, equipped],
  );

  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      if (!seen.has(entry.group)) {
        seen.set(
          entry.group,
          entry.kind === 'produkt'
            ? categoryLabel(entry.category)
            : slotLabel(entry.slot as PartSlot),
        );
      }
    }
    return [{ id: 'alla', label: 'Allt' }, ...[...seen].map(([id, label]) => ({ id, label }))];
  }, [entries]);

  const visible = useMemo(
    () => filterItems(entries, { query, group, availability, sort }),
    [entries, query, group, availability, sort],
  );

  const tryOnLook = useMemo(() => (tryOn ? { ...look, ...tryOn } : look), [look, tryOn]);

  const closeModal = () => {
    setActive(null);
    setError(null);
  };

  const buy = async (entry: ShopEntry) => {
    setBusyKey(entry.key);
    setError(null);
    setNotice(null);
    try {
      const result =
        entry.kind === 'produkt'
          ? await purchaseProduct(entry.product.id)
          : await purchasePart(entry.part.slug);
      setNotice(
        result.already
          ? `${entry.name} ägs redan – inget nytt köp gjordes.`
          : `${entry.name} är nu ditt! ${result.price_xp} XP drogs, du har ${result.total_xp} XP kvar.`,
      );
      setActive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Köpet kunde inte genomföras.');
    } finally {
      setBusyKey(null);
    }
  };

  const previewPart = (part: HalloweenPart) => {
    setTryOn({ [part.slot]: part.slug });
    setNotice(`Provar ${part.name}. Inget sparas förrän du använder delen i avatarstudion.`);
  };

  return (
    <div className="halloween-shop">
      {(notice || error) && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {notice && (
            <div className="halloween-notice is-success" role="status">
              <CheckCircle2 size={17} aria-hidden />
              <span>{notice}</span>
              <button type="button" className="halloween-link" onClick={() => setNotice(null)}>
                Stäng
              </button>
            </div>
          )}
          {error && (
            <div className="halloween-notice is-error" role="alert">
              <AlertCircle size={17} aria-hidden />
              <span>{error}</span>
              <button type="button" className="halloween-link" onClick={() => setError(null)}>
                Stäng
              </button>
            </div>
          )}
        </div>
      )}

      <div className="halloween-shop-top">
        <div className="halloween-wallet-chip">
          <Sparkles size={16} aria-hidden />
          <strong>{wallet.total_xp} XP</strong>
          <span>Nivå {wallet.level}</span>
        </div>
        <div className="halloween-search">
          <Search size={16} aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Sök bland hattar, teman, effekter…"
            aria-label="Sök i shopen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="halloween-filters">
        <div className="halloween-chips" role="group" aria-label="Kategori">
          {groups.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`halloween-chip ${group === row.id ? 'is-active' : ''}`}
              aria-pressed={group === row.id}
              onClick={() => setGroup(row.id)}
            >
              {row.label}
            </button>
          ))}
        </div>
        <div className="halloween-filter-row">
          <label className="halloween-select">
            <Filter size={14} aria-hidden />
            <span className="sr-only">Visa</span>
            <select
              className="input"
              value={availability}
              onChange={(event) => setAvailability(event.target.value as Availability)}
              aria-label="Visa föremål"
            >
              {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((key) => (
                <option key={key} value={key}>
                  {AVAILABILITY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="halloween-select">
            <span className="sr-only">Sortering</span>
            <select
              className="input"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              aria-label="Sortera"
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tryOn && (
        <Card className="halloween-tryon" title="Prova på" subtitle="Så här ser delen ut på din avatar.">
          <div className="halloween-tryon-body">
            <div className="halloween-tryon-stage">
              <AvatarArt look={tryOnLook} parts={parts} label="Förhandsvisning med provad del" />
            </div>
            <div className="halloween-tryon-text">
              <p>
                Provningen sparas inte och kostar inget. Gillar du delen kan du köpa och använda
                den i avatarstudion.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => setTryOn(null)}>
                  Tillbaka till din avatar
                </Button>
                <Button size="sm" variant="ghost" onClick={onOpenAvatar}>
                  Öppna avatarstudion
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag size={24} />}
            title="Inga föremål matchar"
            description="Prova ett annat sökord, en annan kategori eller visa allt."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setGroup('alla');
                  setAvailability('alla');
                }}
              >
                Rensa filter
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="halloween-grid" aria-label="Föremål i shopen">
          {visible.map((entry) => {
            const status = itemStatus(
              { owned: entry.owned, price_xp: entry.price_xp, min_level: entry.min_level },
              wallet,
            );
            const rarity = isRarity(entry.rarity) ? RARITY_META[entry.rarity] : null;
            return (
              <li key={entry.key} className={`halloween-card ${entry.owned ? 'is-owned' : ''}`}>
                <button
                  type="button"
                  className="halloween-card-art"
                  onClick={() => setActive(entry)}
                  aria-label={`Visa ${entry.name}`}
                >
                  {entry.kind === 'produkt' ? (
                    <ProductArt
                      assetKey={entry.asset_key}
                      themeKey={entry.theme_key}
                      rarity={entry.rarity}
                      size={92}
                    />
                  ) : (
                    <PartThumb part={entry.part} parts={parts} size={96} />
                  )}
                </button>
                <div className="halloween-card-body">
                  <div className="halloween-card-title">
                    <h3>{entry.name}</h3>
                    {rarity && <span className={`rarity-dot ${rarity.tone}`} title={rarity.label} />}
                  </div>
                  <p className="halloween-card-desc">{entry.description || 'Halloween-föremål.'}</p>
                  <div className="halloween-card-meta">
                    {entry.owned ? (
                      <Badge tone="green">
                        <CheckCircle2 size={13} aria-hidden /> Ägs
                      </Badge>
                    ) : (
                      <>
                        <span className="halloween-price">
                          {entry.price_xp === 0 ? (
                            'Gratis'
                          ) : (
                            <>
                              <Sparkles size={14} aria-hidden /> {entry.price_xp} XP
                            </>
                          )}
                        </span>
                        <Badge tone={status.tone === 'blue' ? 'blue' : status.tone}>
                          {status.label}
                        </Badge>
                      </>
                    )}
                  </div>
                  <div className="halloween-card-actions">
                    {!entry.owned && (
                      <Button
                        size="sm"
                        loading={busyKey === entry.key}
                        disabled={!canAfford(wallet, entry.price_xp) || wallet.level < entry.min_level}
                        onClick={() => void buy(entry)}
                        icon={<Lock size={14} />}
                      >
                        {entry.price_xp === 0 ? 'Lås upp' : `Köp för ${entry.price_xp} XP`}
                      </Button>
                    )}
                    {entry.owned && entry.kind === 'produkt' && entry.theme_key && (
                      <Button
                        size="sm"
                        variant={entry.equipped ? 'secondary' : 'primary'}
                        onClick={() => void activateTheme(entry.product.id)}
                      >
                        {entry.equipped ? 'Aktivt tema' : 'Aktivera tema'}
                      </Button>
                    )}
                    {entry.kind === 'del' && entry.slot !== 'dekoration' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => previewPart(entry.part)}
                      >
                        Prova
                      </Button>
                    )}
                    {entry.kind === 'del' && entry.slot === 'dekoration' && (
                      <Button size="sm" variant="ghost" onClick={onOpenRoom}>
                        Till rummet
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {active && (
        <Modal
          open
          wide
          title={active.name}
          onClose={closeModal}
          footer={
            <>
              <Button variant="ghost" onClick={closeModal}>
                Stäng
              </Button>
              {!active.owned && (
                <Button
                  loading={busyKey === active.key}
                  disabled={!canAfford(wallet, active.price_xp) || wallet.level < active.min_level}
                  onClick={() => void buy(active)}
                >
                  {active.price_xp === 0 ? 'Lås upp' : `Köp för ${active.price_xp} XP`}
                </Button>
              )}
              {active.owned && active.kind === 'produkt' && active.theme_key && (
                <Button
                  onClick={() => {
                    void activateTheme(active.product.id);
                    closeModal();
                  }}
                >
                  Aktivera tema
                </Button>
              )}
              {active.kind === 'del' && active.slot !== 'dekoration' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    previewPart(active.part);
                    closeModal();
                  }}
                >
                  Prova på avataren
                </Button>
              )}
              {active.kind === 'del' && active.slot === 'dekoration' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    closeModal();
                    onOpenRoom();
                  }}
                >
                  Till rummet
                </Button>
              )}
            </>
          }
        >
          {error && (
            <div className="halloween-notice is-error" role="alert">
              <AlertCircle size={17} aria-hidden />
              <span>{error}</span>
            </div>
          )}
          <div className="halloween-detail">
            <div className="halloween-detail-art">
              {active.kind === 'produkt' ? (
                <ProductArt
                  assetKey={active.asset_key}
                  themeKey={active.theme_key}
                  rarity={active.rarity}
                  size={148}
                />
              ) : (
                <PartThumb part={active.part} parts={parts} size={150} />
              )}
            </div>
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                {isRarity(active.rarity) && (
                  <Badge tone="neutral">{RARITY_META[active.rarity].label}</Badge>
                )}
                {active.kind === 'produkt' ? (
                  <Badge tone="blue">{categoryLabel(active.category)}</Badge>
                ) : (
                  <Badge tone="blue">{slotLabel(active.category as PartSlot)}</Badge>
                )}
                {active.owned && <Badge tone="green">Ägs</Badge>}
              </div>
              <p>{active.description || 'Ett Halloween-föremål ur säsongens samling.'}</p>
              <dl className="halloween-detail-list">
                <div>
                  <dt>Pris</dt>
                  <dd>
                    {active.owned
                      ? 'Redan upplåst'
                      : active.price_xp === 0
                        ? 'Gratis'
                        : `${active.price_xp} XP`}
                  </dd>
                </div>
                <div>
                  <dt>Nivåkrav</dt>
                  <dd>
                    Nivå {active.min_level}
                    {wallet.level < active.min_level ? ' (inte uppnått)' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Ditt saldo</dt>
                  <dd>{wallet.total_xp} XP</dd>
                </div>
                <div>
                  <dt>Kategori</dt>
                  <dd>
                    {active.kind === 'produkt'
                      ? CATEGORY_META[active.category]?.label ?? active.category
                      : slotLabel(active.category as PartSlot)}
                  </dd>
                </div>
              </dl>
              {!active.owned && active.price_xp > wallet.total_xp && (
                <p className="small muted">
                  Du saknar {active.price_xp - wallet.total_xp} XP. XP får du när lärare godkänner
                  dina inlämningar.
                </p>
              )}
              {active.kind === 'del' && active.slot === 'dekoration' && (
                <p className="small muted">
                  Dekorationer ställs ut i ditt Halloween-rum efter köpet.
                </p>
              )}
              {active.kind === 'del' && active.slot !== 'dekoration' && (
                <p className="small muted">
                  Efter köpet använder du delen i avatarstudion. Provningen sparar inget.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      <div className="halloween-shop-footer">
        <p className="small muted">Allt du köper ligger kvar i samlingen och kan användas igen.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={onOpenAvatar}>
            Bygg din avatar
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenRoom}>
            Till rummet
          </Button>
        </div>
      </div>
    </div>
  );
};
