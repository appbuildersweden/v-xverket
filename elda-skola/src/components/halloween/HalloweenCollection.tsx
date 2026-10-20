import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Lock, PackageOpen, Search, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../ui';
import { useHalloween } from '../../lib/halloween-context';
import {
  RARITY_META,
  categoryLabel,
  isRarity,
  slotLabel,
  type PartSlot,
} from '../../lib/halloween-catalog';
import { PartThumb, ProductArt } from './ProductArt';
import type { OwnedItem } from '../../lib/halloween';

/**
 * Elevens samling.
 *
 * Bara riktiga köp och upplåsningar visas. Ett föremål som är utrustat markeras
 * med var det sitter, och knappen utrustar eller tar bort det genom servern –
 * ägandet kontrolleras där, inte här.
 */
const CollectionArt: React.FC<{
  item: OwnedItem;
  parts: ReturnType<typeof useHalloween>['parts'];
}> = ({ item, parts }) => {
  if (item.kind === 'produkt') {
    return (
      <ProductArt
        assetKey={item.asset_key}
        themeKey={item.theme_key}
        rarity={item.rarity}
        size={88}
        name={item.name}
      />
    );
  }
  const part = parts.find((row) => row.slug === item.slug);
  return part ? <PartThumb part={part} parts={parts} size={88} /> : null;
};

export const HalloweenCollection: React.FC<{
  onOpenShop: () => void;
  onOpenAvatar: () => void;
  onOpenRoom: () => void;
}> = ({ onOpenShop, onOpenAvatar, onOpenRoom }) => {
  const {
    collection,
    parts,
    products,
    purchases,
    ownedParts,
    room,
    wallet,
    equip,
    unequip,
  } = useHalloween();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('alla');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of collection) {
      if (!seen.has(item.category)) {
        seen.set(
          item.category,
          item.slot && item.slot !== item.category
            ? categoryLabel(item.category)
            : item.kind === 'del'
              ? slotLabel(item.category as PartSlot)
              : categoryLabel(item.category),
        );
      }
    }
    return [{ id: 'alla', label: 'Allt' }, ...[...seen].map(([id, label]) => ({ id, label }))];
  }, [collection]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return collection.filter((item) => {
      if (filter !== 'alla' && item.category !== filter) return false;
      if (!text) return true;
      return `${item.name} ${item.category}`.toLowerCase().includes(text);
    });
  }, [collection, filter, query]);

  /** Låsta föremål med sina krav – delar först, sedan produkter. */
  const locked = useMemo(() => {
    const purchasedProductIds = new Set(
      purchases.map((row) => row.product_id).filter((id): id is string => Boolean(id)),
    );
    const lockedParts = parts
      .filter((part) => !part.free && !ownedParts.has(part.slug))
      .map((part) => ({
        key: `d-${part.slug}`,
        name: part.name,
        category: part.slot,
        price: part.price_xp,
        level: part.min_level,
        rarity: part.rarity,
        kind: 'del' as const,
      }));
    const lockedProducts = products
      .filter(
        (product) =>
          product.category !== 'avatar' &&
          !purchasedProductIds.has(product.id) &&
          product.published,
      )
      .map((product) => ({
        key: `p-${product.id}`,
        name: product.name,
        category: product.category,
        price: product.price_xp,
        level: product.min_level,
        rarity: product.rarity,
        kind: 'produkt' as const,
      }));
    return [...lockedParts, ...lockedProducts].sort((a, b) => a.price - b.price);
  }, [parts, products, purchases, ownedParts]);

  const act = async (itemId: string, run: () => Promise<void>) => {
    setBusy(itemId);
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ändringen kunde inte sparas.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="halloween-collection">
      <div className="halloween-collection-head">
        <div className="halloween-wallet-chip">
          <Sparkles size={16} aria-hidden />
          <strong>{wallet.total_xp} XP</strong>
          <span>Nivå {wallet.level}</span>
        </div>
        <div className="halloween-stats">
          <span>
            <strong>{collection.length}</strong> ägda föremål
          </span>
          <span>
            <strong>{collection.filter((item) => item.equipped).length}</strong> i bruk
          </span>
          <span>
            <strong>{locked.length}</strong> kvar att låsa upp
          </span>
        </div>
      </div>

      {error && (
        <div className="halloween-notice is-error" role="alert">
          <AlertCircle size={17} aria-hidden />
          <span>{error}</span>
          <button type="button" className="halloween-link" onClick={() => setError(null)}>
            Stäng
          </button>
        </div>
      )}

      <div className="halloween-collection-tools">
        <div className="halloween-search">
          <Search size={16} aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Sök i din samling"
            aria-label="Sök i din samling"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="halloween-chips" role="group" aria-label="Filtrera samlingen">
          {groups.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`halloween-chip ${filter === row.id ? 'is-active' : ''}`}
              aria-pressed={filter === row.id}
              onClick={() => setFilter(row.id)}
            >
              {row.label}
            </button>
          ))}
        </div>
      </div>

      {collection.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageOpen size={24} />}
            title="Din samling är tom ännu"
            description="När du låser upp eller köper ditt första Halloween-föremål dyker det upp här. XP får du när lärare godkänner dina inlämningar."
            action={<Button onClick={onOpenShop}>Till shopen</Button>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageOpen size={24} />}
            title="Inga träffar"
            description="Prova ett annat sökord eller visa allt."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('alla');
                }}
              >
                Rensa filter
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="halloween-grid halloween-grid-collection" aria-label="Dina föremål">
          {visible.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="halloween-card is-owned">
              <div className="halloween-card-art">
                <CollectionArt item={item} parts={parts} />
              </div>
              <div className="halloween-card-body">
                <div className="halloween-card-title">
                  <h3>{item.name}</h3>
                  {isRarity(item.rarity) && (
                    <span
                      className={`rarity-dot ${RARITY_META[item.rarity].tone}`}
                      title={RARITY_META[item.rarity].label}
                    />
                  )}
                </div>
                <p className="halloween-card-desc">
                  {item.slot ? slotLabel(item.slot as PartSlot) : categoryLabel(item.category)}
                </p>
                <div className="halloween-card-meta">
                  <span className="halloween-price">{item.price_paid} XP</span>
                  {item.equipped && <Badge tone="green">I bruk</Badge>}
                </div>
                <div className="halloween-card-actions">
                  {item.kind === 'produkt' && item.canEquip && item.slot ? (
                    item.equipped ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === item.id}
                        onClick={() =>
                          void act(item.id, () => unequip(item.slot as string))
                        }
                      >
                        Ta bort
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === item.id}
                        onClick={() => void act(item.id, () => equip(item.id))}
                      >
                        Använd
                      </Button>
                    )
                  ) : item.kind === 'del' && item.slot === 'dekoration' ? (
                    <Button size="sm" variant="secondary" onClick={onOpenRoom}>
                      {item.equipped ? 'I rummet' : 'Ställ ut'}
                    </Button>
                  ) : item.kind === 'del' ? (
                    <Button size="sm" variant="secondary" onClick={onOpenAvatar}>
                      {item.equipped ? 'Används' : 'Använd'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card
        className="halloween-locked"
        title="Kvar att låsa upp"
        subtitle={`${locked.length} föremål · din nivå är ${wallet.level}`}
        action={<Lock size={18} />}
      >
        {locked.length === 0 ? (
          <div className="halloween-all-unlocked" role="status">
            <CheckCircle2 size={22} aria-hidden />
            <div>
              <strong>Allt är upplåst.</strong>
              <p className="small muted">
                Du har hela säsongens samling. Nya föremål dyker upp i shopen.
              </p>
            </div>
          </div>
        ) : (
          <ul className="halloween-locked-list">
            {locked.slice(0, 12).map((item) => (
              <li key={item.key}>
                <span>
                  <strong>{item.name}</strong>
                  <span className="small muted">
                    {' '}
                    · {item.kind === 'del' ? slotLabel(item.category as PartSlot) : categoryLabel(item.category)}
                  </span>
                </span>
                <span className="halloween-locked-req">
                  {item.price} XP · nivå {item.level}
                  {wallet.level < item.level && <span className="small muted"> (låst)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {locked.length > 12 && (
          <p className="small muted">Och {locked.length - 12} till i shopen.</p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <Button size="sm" variant="secondary" onClick={onOpenShop}>
            Till shopen
          </Button>
        </div>
      </Card>

      <p className="small muted">
        Rummet har {room.length} av 6 platser fyllda. Utrustade teman och ramar syns direkt i hela
        appen.
      </p>
    </div>
  );
};
