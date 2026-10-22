import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Dices,
  Lock,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Badge, Button, Card, Spinner } from '../ui';
import { useHalloween } from '../../lib/halloween-context';
import {
  AVATAR_SLOTS,
  DEFAULT_LOOK,
  SLOT_BY_ID,
  canAfford,
  normalizeLook,
  RARITY_META,
  isRarity,
  type AvatarSlot,
} from '../../lib/halloween-catalog';
import AvatarArt from './AvatarArt';
import { PartThumb, ColorSwatch } from './ProductArt';
import { partProgress, type HalloweenPart } from '../../lib/halloween';

/**
 * Avatarstudion.
 *
 * Eleven bygger sin avatar i lager: hudton, ögon, hår, kläder och scen. Allt
 * som visas är riktiga katalogdelar, och förhandsvisningen ritar samma SVG som
 * resten av appen använder. Ett provat föremål sparas aldrig förrän eleven
 * trycker på Spara, och servern vägrar spara en del eleven inte äger – knappen
 * här är bara ett bekvämt sätt att komma dit.
 */

const GROUPS: Array<'Karaktär' | 'Kläder' | 'Scen'> = ['Karaktär', 'Kläder', 'Scen'];

export const AvatarStudio: React.FC<{ onOpenShop?: () => void }> = ({ onOpenShop }) => {
  const { parts, look, ownedParts, wallet, saveLook, purchasePart, loading, ready } = useHalloween();

  const [draft, setDraft] = useState<Record<string, string>>(() => normalizeLook(look));
  const [saved, setSaved] = useState<Record<string, string>>(() => normalizeLook(look));
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('hudton');
  const [history, setHistory] = useState<Array<Record<string, string>>>([]);
  const [future, setFuture] = useState<Array<Record<string, string>>>([]);
  const [preview, setPreview] = useState<{ slot: AvatarSlot; slug: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Servern är källan: när ett sparat utseende kommer in (t.ex. efter köp i en
  // annan flik) följer draften med, men bara om eleven inte har osparade val.
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  useEffect(() => {
    if (dirty) return;
    const next = normalizeLook(look);
    if (JSON.stringify(next) !== JSON.stringify(saved)) {
      setSaved(next);
      setDraft(next);
    }
  }, [look, saved, dirty]);

  const slotMeta = SLOT_BY_ID[activeSlot];
  const options = useMemo(
    () =>
      parts
        .filter((part) => part.slot === activeSlot)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'sv')),
    [parts, activeSlot],
  );

  const previewLook = useMemo(
    () => (preview ? { ...draft, [preview.slot]: preview.slug } : draft),
    [draft, preview],
  );

  const push = (next: Record<string, string>) => {
    setHistory((stack) => [...stack.slice(-19), draft]);
    setFuture([]);
    setDraft(next);
    setPreview(null);
    setError(null);
    setNotice(null);
  };

  const apply = (part: HalloweenPart) => {
    if (!part.free && !ownedParts.has(part.slug)) {
      setPreview({ slot: activeSlot, slug: part.slug });
      setNotice(`${part.name} är inte upplåst ännu. Prova den här, eller lås upp den för ${part.price_xp} XP.`);
      return;
    }
    push({ ...draft, [activeSlot]: part.slug });
  };

  const removeSlot = () => {
    const next = { ...draft };
    delete next[activeSlot];
    // Standardvalet används när platsen töms, så avataren aldrig blir ofärdig.
    push({ ...next, ...(slotMeta.optional ? {} : { [activeSlot]: DEFAULT_LOOK[activeSlot] }) });
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((stack) => stack.slice(0, -1));
    setFuture((stack) => [draft, ...stack]);
    setDraft(previous);
    setPreview(null);
    setNotice(null);
    setError(null);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((stack) => stack.slice(1));
    setHistory((stack) => [...stack, draft]);
    setDraft(next);
    setPreview(null);
  };

  const reset = () => {
    push(normalizeLook(DEFAULT_LOOK));
    setNotice('Utseendet är återställt till standard. Spara för att behålla det.');
  };

  const surprise = () => {
    const next: Record<string, string> = { ...DEFAULT_LOOK };
    for (const slot of AVATAR_SLOTS) {
      const owned = parts.filter(
        (part) => part.slot === slot.id && (part.free || ownedParts.has(part.slug)),
      );
      const pool = slot.optional && Math.random() < 0.45 ? [] : owned;
      if (pool.length === 0) {
        if (slot.optional) delete next[slot.id];
        continue;
      }
      next[slot.id] = pool[Math.floor(Math.random() * pool.length)].slug;
    }
    push(next);
    setNotice('Ett nytt utseende av dina upplåsta delar. Spara om du gillar det.');
  };

  const buy = async (part: HalloweenPart) => {
    setBusy(part.slug);
    setError(null);
    setNotice(null);
    try {
      const result = await purchasePart(part.slug);
      setNotice(
        result.already
          ? `${part.name} ägs redan.`
          : `${part.name} är upplåst! ${result.price_xp} XP drogs, du har ${result.total_xp} XP kvar.`,
      );
      setPreview(null);
      setDraft((current) => ({ ...current, [part.slot]: part.slug }));
      setFuture([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Köpet kunde inte genomföras.');
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const result = await saveLook(draft);
      setSaved(result);
      setDraft(result);
      setHistory([]);
      setFuture([]);
      setPreview(null);
      setNotice('Avataren är sparad. Den syns på profilen och här nästa gång du loggar in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avataren kunde inte sparas.');
    } finally {
      setBusy(null);
    }
  };

  const progress = partProgress(parts, ownedParts);

  if (!ready && loading) return <Spinner label="Hämtar din avatar…" />;

  return (
    <div className="halloween-studio">
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

      <div className="halloween-studio-grid">
        <div className="halloween-studio-stage">
          <div className="halloween-stage-frame">
            <AvatarArt
              look={previewLook}
              parts={parts}
              label="Förhandsvisning av din Halloween-avatar"
            />
            {preview && (
              <p className="halloween-preview-flag">
                Provar {parts.find((part) => part.slug === preview.slug)?.name ?? 'del'} – inte sparad
              </p>
            )}
          </div>

          <div className="halloween-studio-actions">
            <Button
              icon={<Save size={16} />}
              loading={busy === 'save'}
              disabled={!dirty && !preview}
              onClick={() => void commit()}
            >
              Spara avatar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Undo2 size={15} />}
              onClick={undo}
              disabled={history.length === 0}
            >
              Ångra
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Redo2 size={15} />}
              onClick={redo}
              disabled={future.length === 0}
            >
              Gör om
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={15} />}
              onClick={reset}
            >
              Återställ
            </Button>
            <Button variant="ghost" size="sm" icon={<Dices size={15} />} onClick={surprise}>
              Överraska mig
            </Button>
          </div>

          <div className="halloween-studio-meta">
            <Badge tone="green">
              {progress.owned} av {progress.total} delar upplåsta
            </Badge>
            <span className="small muted">
              {wallet.total_xp} XP · nivå {wallet.level}
            </span>
          </div>
          <p className="small muted">
            Färger och delar sparas separat från din samling. Att byta hatt eller frisyr tar aldrig
            bort något du har köpt.
          </p>
        </div>

        <div className="halloween-studio-panel">
          {GROUPS.map((group) => {
            const slots = AVATAR_SLOTS.filter((slot) => slot.group === group);
            return (
              <div key={group} className="halloween-slot-group">
                <h3 className="halloween-slot-group-title">{group}</h3>
                <div className="halloween-slot-tabs" role="tablist" aria-label={group}>
                  {slots.map((slot) => {
                    const active = slot.id === activeSlot;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`halloween-slot-tab ${active ? 'is-active' : ''}`}
                        onClick={() => {
                          setActiveSlot(slot.id);
                          setPreview(null);
                        }}
                      >
                        {slot.label}
                        {draft[slot.id] ? (
                          <span className="halloween-slot-dot" aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <Card
            title={slotMeta.label}
            subtitle={slotMeta.hint}
            action={
              slotMeta.optional ? (
                <Button size="sm" variant="ghost" onClick={removeSlot} disabled={!draft[activeSlot]}>
                  Ta bort
                </Button>
              ) : undefined
            }
          >
            {options.length === 0 ? (
              <p className="small muted">Inga delar finns för den här platsen ännu.</p>
            ) : (
              <ul className="halloween-options" aria-label={`Välj ${slotMeta.label.toLowerCase()}`}>
                {options.map((part) => {
                  const owned = part.free || ownedParts.has(part.slug);
                  const selected = draft[activeSlot] === part.slug;
                  const proven = preview?.slug === part.slug;
                  return (
                    <li
                      key={part.slug}
                      className={`halloween-option ${selected ? 'is-selected' : ''} ${
                        owned ? '' : 'is-locked'
                      } ${proven ? 'is-preview' : ''}`}
                    >
                      <button
                        type="button"
                        className="halloween-option-main"
                        aria-pressed={selected}
                        onClick={() => apply(part)}
                        title={part.description ?? part.name}
                      >
                        <span className="halloween-option-art">
                          {part.kind === 'farg' && part.color ? (
                            <ColorSwatch color={part.color} size={40} label={part.name} />
                          ) : (
                            <PartThumb part={part} parts={parts} size={64} />
                          )}
                        </span>
                        <span className="halloween-option-text">
                          <strong>{part.name}</strong>
                          <span className="small muted">
                            {owned ? (
                              isRarity(part.rarity) ? (
                                RARITY_META[part.rarity].label
                              ) : (
                                'Upplåst'
                              )
                            ) : (
                              <>
                                <Lock size={12} aria-hidden /> {part.price_xp} XP · nivå{' '}
                                {part.min_level}
                              </>
                            )}
                          </span>
                        </span>
                        {selected && <CheckCircle2 size={16} className="halloween-option-check" />}
                      </button>
                      {!owned && (
                        <div className="halloween-option-buy">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreview({ slot: activeSlot, slug: part.slug })}
                          >
                            Prova
                          </Button>
                          <Button
                            size="sm"
                            loading={busy === part.slug}
                            disabled={
                              !canAfford(wallet, part.price_xp) || wallet.level < part.min_level
                            }
                            icon={<Sparkles size={13} />}
                            onClick={() => void buy(part)}
                          >
                            {part.price_xp} XP
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="halloween-studio-foot">
            {onOpenShop && (
              <Button variant="secondary" size="sm" onClick={onOpenShop}>
                Fler delar i shopen
              </Button>
            )}
            <span className="small muted">
              {dirty ? 'Osparade ändringar' : 'Allt är sparat'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
