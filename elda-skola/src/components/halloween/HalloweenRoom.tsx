import React, { useMemo, useState } from 'react';
import { AlertCircle, Plus, Sparkles, Trash2, Trees } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../ui';
import { useHalloween } from '../../lib/halloween-context';
import { ROOM_SLOT_LABELS, slotLabel } from '../../lib/halloween-catalog';
import { DecorArt } from './ProductArt';
import { HalloweenRoomScene } from './HalloweenRoomScene';

/**
 * Elevens Halloween-rum.
 *
 * Rummet har sex fasta platser och sparas på servern genom
 * `halloween_room_place` – servern kontrollerar att eleven äger dekorationen
 * innan raden skrivs. Här finns inget "spara"-steg: varje placering är ett
 * riktigt anrop, och det som står i rummet är det som ligger i databasen.
 *
 * Scenen är medvetet matt: inga glansiga gradienter eller suddiga glasrutor,
 * bara lager av mörka ytor, en måne och varma fönster (se
 * HalloweenRoomScene). Dekorationerna är det som ska lysa, inte ramen runt
 * dem. Den bakre raden ritas mindre än den främre, så rummet får djup.
 */

export const HalloweenRoom: React.FC<{ onOpenShop: () => void }> = ({ onOpenShop }) => {
  const { parts, ownedParts, room, placeRoom, removeRoom } = useHalloween();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const decorations = useMemo(
    () =>
      parts
        .filter((part) => part.slot === 'dekoration' && (part.free || ownedParts.has(part.slug)))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'sv')),
    [parts, ownedParts],
  );

  const partBySlug = useMemo(() => new Map(parts.map((part) => [part.slug, part])), [parts]);
  const placement = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of room) map.set(row.slot, row.part_slug);
    return map;
  }, [room]);

  const place = async (slug: string) => {
    setBusy(slug);
    setError(null);
    setNotice(null);
    try {
      await placeRoom(slug, selected);
      const name = partBySlug.get(slug)?.name ?? 'Dekorationen';
      setNotice(`${name} står nu på platsen.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Placeringen kunde inte sparas.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async (slot: number) => {
    setBusy(`remove-${slot}`);
    setError(null);
    setNotice(null);
    try {
      await removeRoom(slot);
      setNotice('Platsen är tom igen.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platsen kunde inte tömmas.');
    } finally {
      setBusy(null);
    }
  };

  const slots = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div className="halloween-room">
      {(notice || error) && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {notice && (
            <div className="halloween-notice is-success" role="status">
              <Sparkles size={17} aria-hidden />
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

      <div className="halloween-room-stage" role="group" aria-label="Ditt Halloween-rum">
        <HalloweenRoomScene />
        <div className="halloween-room-grid">
          {slots.map((slot) => {
            const slug = placement.get(slot);
            const part = slug ? partBySlug.get(slug) : null;
            const label = part ? part.name : 'Tom plats';
            return (
              <button
                key={slot}
                type="button"
                className={`halloween-room-slot ${selected === slot ? 'is-selected' : ''} ${
                  part ? 'is-filled' : ''
                } slot-${slot}`}
                aria-pressed={selected === slot}
                aria-label={`${ROOM_SLOT_LABELS[slot]}: ${label}`}
                onClick={() => setSelected(slot)}
              >
                {part ? (
                  <span className="halloween-room-item">
                    <DecorArt slug={part.slug} size={78} />
                  </span>
                ) : (
                  <span className="halloween-room-empty">
                    <Plus size={16} aria-hidden />
                  </span>
                )}
                <span className="halloween-room-slot-name">
                  {part ? part.name : ROOM_SLOT_LABELS[slot]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="halloween-room-panel">
        <Card
          title={`Plats: ${ROOM_SLOT_LABELS[selected]}`}
          subtitle="Välj en dekoration du äger. Placeringen sparas direkt."
          action={
            placement.has(selected) ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={15} />}
                loading={busy === `remove-${selected}`}
                onClick={() => void clear(selected)}
              >
                Töm platsen
              </Button>
            ) : undefined
          }
        >
          {decorations.length === 0 ? (
            <EmptyState
              icon={<Trees size={24} />}
              title="Inga dekorationer ännu"
              description="Dekorationer köps i shopen. Den första pumpalyktan och gravstenen är gratis."
              action={<Button onClick={onOpenShop}>Till shopen</Button>}
            />
          ) : (
            <ul className="halloween-decor-list" aria-label="Dina dekorationer">
              {decorations.map((part) => {
                const placedOn = room.find((row) => row.part_slug === part.slug)?.slot;
                const here = placedOn === selected;
                return (
                  <li key={part.slug} className={`halloween-decor ${here ? 'is-here' : ''}`}>
                    <span className="halloween-decor-art">
                      <DecorArt slug={part.slug} size={52} />
                    </span>
                    <span className="halloween-decor-text">
                      <strong>{part.name}</strong>
                      <span className="small muted">
                        {part.description ?? slotLabel('dekoration')}
                      </span>
                      {placedOn !== undefined && !here && (
                        <Badge tone="neutral">Står på plats {placedOn + 1}</Badge>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant={here ? 'secondary' : 'primary'}
                      loading={busy === part.slug}
                      disabled={here}
                      onClick={() => void place(part.slug)}
                    >
                      {here ? 'Här' : 'Ställ här'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <p className="small muted">
          Rummet sparas per konto och finns kvar nästa gång du loggar in. Föremål du köper i shopen
          blir tillgängliga här direkt.
        </p>
      </div>
    </div>
  );
};
