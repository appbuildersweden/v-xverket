#!/usr/bin/env python3
"""Jämför ett ark med utklippta ikoner mot andra bilder.

Används för att svara på frågan: finns det någon ikon i de andra bilderna som
inte redan finns bland de utklippta? Varje utklippt ikon (PNG med transparent
bakgrund) letas upp i målbilden i flera skalor med normaliserad korskorrelation,
och träffarna ritas ut så att resultatet går att kontrollera med ögat.

Körs med:  python scripts/jamfor-halloween-ikoner.py <ikommapp> <bild> [fler bilder]
Kräver Pillow, numpy och scipy.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.signal import fftconvolve

# Skalor som ikonerna letas i. Bilderna kan visa samma ikon i annan storlek.
SCALES = [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25]
# Lägsta poäng som räknas som en träff.
HIT = 0.55


def to_gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert('L'), dtype=np.float64)


def masked_scores(image: np.ndarray, template: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Normaliserad korskorrelation (nollmedelvärde) inom mallens form."""
    sum_t = float((template * mask).sum())
    sum_t2 = float((template * template * mask).sum())
    n = float(mask.sum())
    if n == 0 or sum_t2 - sum_t * sum_t / n <= 0:
        return np.zeros((0, 0))

    flipped = template * mask
    flipped = flipped[::-1, ::-1]
    corr = fftconvolve(image, flipped, mode='valid')
    sum_i = fftconvolve(image, mask[::-1, ::-1], mode='valid')
    sum_i2 = fftconvolve(image * image, mask[::-1, ::-1], mode='valid')

    numerator = corr - sum_i * sum_t / n
    variance = sum_i2 - sum_i * sum_i / n
    denominator = np.sqrt(np.maximum(variance, 0) * max(sum_t2 - sum_t * sum_t / n, 0))
    with np.errstate(divide='ignore', invalid='ignore'):
        score = np.where(denominator > 0, numerator / denominator, 0)
    return score


def find_icon(gray: np.ndarray, icon: Image.Image) -> tuple[float, tuple[int, int], int]:
    """Bästa träffen för en ikon i alla skalor: poäng, hörn och skalstorlek."""
    best = (-1.0, (0, 0), 0)
    rgba = np.asarray(icon.convert('RGBA'))
    mask_full = (rgba[:, :, 3] > 0).astype(np.float64)
    gray_full = np.asarray(icon.convert('RGBA').convert('L'), dtype=np.float64)

    for scale in SCALES:
        width = max(4, round(icon.width * scale))
        height = max(4, round(icon.height * scale))
        if width >= gray.shape[1] or height >= gray.shape[0]:
            continue
        if scale != 1.0:
            mask = np.asarray(
                Image.fromarray((mask_full * 255).astype(np.uint8)).resize(
                    (width, height), Image.NEAREST
                ),
                dtype=np.float64,
            ) / 255.0
            template = np.asarray(
                Image.fromarray(gray_full.astype(np.uint8)).resize((width, height), Image.BILINEAR),
                dtype=np.float64,
            )
        else:
            mask, template = mask_full, gray_full
        if mask.sum() < 16:
            continue
        scores = masked_scores(gray, template, mask)
        if scores.size == 0:
            continue
        index = int(np.argmax(scores))
        value = float(scores.flat[index])
        y, x = divmod(index, scores.shape[1])
        if value > best[0]:
            best = (value, (x, y), width)
    return best


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    icon_dir = Path(sys.argv[1])
    icons = sorted(p for p in icon_dir.glob('*.png'))
    if not icons:
        print(f'Inga ikoner i {icon_dir}')
        return 1

    for target in sys.argv[2:]:
        path = Path(target)
        target_image = Image.open(path).convert('RGB')
        gray = to_gray(target_image)
        print(f'\n=== {path.name} ({target_image.width}×{target_image.height})')

        annotated = target_image.copy()
        draw = ImageDraw.Draw(annotated)
        covered = np.zeros(gray.shape, dtype=bool)
        hits: list[tuple[str, float, tuple[int, int], int]] = []
        for icon_path in icons:
            score, corner, width = find_icon(gray, Image.open(icon_path))
            hits.append((icon_path.name, score, corner, width))

        for name, score, (x, y), width in hits:
            if score < HIT:
                continue
            source = Image.open(icon_dir / name)
            height = round(source.height * width / source.width)
            covered[y : y + height, x : x + width] = True
            draw.rectangle([x, y, x + width, y + height], outline=(255, 0, 0), width=1)
            draw.text((x, max(0, y - 12)), f'{name[:18]} {score:.2f}', fill=(255, 255, 0))

        print(f'  {len(hits)} ikoner jämförda, {sum(1 for h in hits if h[1] >= HIT)} träffar över {HIT}')
        for name, score, (x, y), width in hits:
            flag = 'träff' if score >= HIT else 'svag'
            print(f'    {name:26} {flag} {score:5.2f} vid ({x},{y}) bredd {width}')

        annotated.save(path.with_name(path.stem + '-matchad.png'))
        coverage = Image.fromarray(np.where(covered, 255, 0).astype(np.uint8))
        coverage.save(path.with_name(path.stem + '-tackning.png'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
