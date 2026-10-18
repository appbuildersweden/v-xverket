#!/usr/bin/env python3
"""Delar upp Halloween-ikonarket i en fil per ikon.

Arket är en bild med sex rader (PUMPKINS, CREATURES, CANDY & TREATS,
WITCH & MAGIC, GRAVEYARD, DARK DECOR) och en platt bakgrundsfärg. Skriptet
hittar ikonraderna, delar varje rad i enskilda ikoner och skriver varje ikon
som en egen PNG med transparent bakgrund.

Bakgrunden tas bort genom att fylla från kanten: bara bakgrundspixlar som
hänger ihop med bildkanten blir genomskinliga. En ikon som råkar använda
bakgrundsfärgen inuti sig behåller därför sin färg.

Körs med:  python scripts/dela-halloween-ikoner.py <ark.png> <målkatalog>
Kräver Pillow och numpy.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# Radernas rubriker i arket, i den ordning de ligger. Används för att namnge
# ikonerna och för att kunna kontrollera att varje rad hittas.
ROW_LABELS = [
    "pumpkins",
    "creatures",
    "candy",
    "witch",
    "graveyard",
    "decor",
]

# Minsta höjd på en rad för att räknas som ikonrad (rubrikerna är ~17 px).
MIN_ROW_HEIGHT = 40
# Minsta avstånd mellan två ikoner på samma rad.
ICON_GAP = 10
# En ikon är bredare än så här. Radrubriker och sidfotstext består av bokstäver
# som är smalare, vilket gör att texter aldrig räknas som ikonrader.
MIN_ICON_WIDTH = 24
# Minsta antal ikoner på en rad för att raden ska räknas.
MIN_ICONS_PER_ROW = 3


def background_colour(image: np.ndarray) -> np.ndarray:
    """Bakgrunden är den vanligaste färgen längs bildens kant."""
    edge = np.concatenate(
        [
            image[0, :, :],
            image[-1, :, :],
            image[:, 0, :],
            image[:, -1, :],
        ]
    )
    colours, counts = np.unique(edge.reshape(-1, image.shape[2]), axis=0, return_counts=True)
    return colours[counts.argmax()]


def icon_rows(mask: np.ndarray) -> list[tuple[int, int]]:
    """Hittar de y-band som innehåller ikoner.

    Ett band räknas bara som en ikonrad om det innehåller minst tre breda
    figurer. Radrubrikerna och texten i sidfoten består av smala bokstäver och
    hoppas därför över.
    """
    filled = mask.any(axis=1)
    rows: list[tuple[int, int]] = []
    start: int | None = None
    for y, value in enumerate(filled):
        if value and start is None:
            start = y
        elif not value and start is not None:
            if looks_like_icon_row(mask, start, y - 1):
                rows.append((start, y - 1))
            start = None
    if start is not None and looks_like_icon_row(mask, start, len(filled) - 1):
        rows.append((start, len(filled) - 1))
    return rows


def looks_like_icon_row(mask: np.ndarray, y0: int, y1: int) -> bool:
    """Sant när bandet har ikonhöjd och innehåller tillräckligt breda figurer."""
    if y1 - y0 + 1 < MIN_ROW_HEIGHT:
        return False
    wide = [c for c in icon_columns(mask, y0, y1) if c[1] - c[0] + 1 >= MIN_ICON_WIDTH]
    return len(wide) >= MIN_ICONS_PER_ROW


def icon_columns(mask: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    """Delar en rad i enskilda ikoner utifrån tomrummen mellan dem."""
    band = mask[y0 : y1 + 1]
    filled = band.any(axis=0)
    columns: list[tuple[int, int]] = []
    start: int | None = None
    last = -10_000
    for x, value in enumerate(filled):
        if value:
            if start is None:
                start = x
            last = x
        elif start is not None and x - last >= ICON_GAP:
            columns.append((start, last))
            start = None
    if start is not None:
        columns.append((start, last))
    return columns


def cut_out(rgb: np.ndarray, box: tuple[int, int, int, int], background: np.ndarray) -> Image.Image:
    """Beskär ikonen och gör kantansluten bakgrund genomskinlig."""
    x0, y0, x1, y1 = box
    crop = rgb[y0 : y1 + 1, x0 : x1 + 1]
    is_background = np.all(crop == background, axis=2)

    # Bara bakgrund som hänger ihop med kanten tas bort — hål i motivet lämnas.
    labels, _ = ndimage.label(is_background)
    edge_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    edge_labels.discard(0)
    outside = np.isin(labels, list(edge_labels))

    rgba = np.dstack([crop, np.where(outside, 0, 255).astype(np.uint8)])
    image = Image.fromarray(rgba, mode="RGBA")

    # Beskär bort helt tomma kanter så att varje ikon fyller sin egen ruta.
    alpha_bbox = Image.fromarray(rgba[:, :, 3]).getbbox()
    return image.crop(alpha_bbox) if alpha_bbox else image


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)

    rgb = np.array(Image.open(source).convert("RGB"))
    background = background_colour(rgb)
    mask = np.any(rgb != background, axis=2)

    rows = icon_rows(mask)
    if len(rows) != len(ROW_LABELS):
        print(f"Väntade {len(ROW_LABELS)} ikonrader men hittade {len(rows)}: {rows}")
        return 1
    print(f"bakgrundsfärg: {tuple(int(v) for v in background)}")

    manifest: list[dict[str, object]] = []
    index = 0
    for label, (y0, y1) in zip(ROW_LABELS, rows):
        columns = icon_columns(mask, y0, y1)
        for column, (x0, x1) in enumerate(columns, start=1):
            icon = cut_out(rgb, (x0, y0, x1, y1), background)
            index += 1
            name = f"{index:02d}-{label}-{column}.png"
            icon.save(target / name)
            manifest.append(
                {
                    "index": index,
                    "file": name,
                    "row": label,
                    "column": column,
                    "width": icon.width,
                    "height": icon.height,
                }
            )
        print(f"{label}: {len(columns)} ikoner")

    (target / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"{index} ikoner skrivna till {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
