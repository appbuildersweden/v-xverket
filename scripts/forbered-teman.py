#!/usr/bin/env python3
"""Gör om temabilderna till webbtillgångar i appen.

Bilderna kommer från användaren (fem motiv, ett per temaprodukt) och sparas som
WebP i `src-new/src/assets/teman/`. De skalas ned till högst 1600 px bredd och
komprimeras så att alla fem ryms i appens paket utan att bli suddiga — temat
visas alltid dämpat bakom appens egna ytor, så full upplösning behövs inte.

    python scripts/forbered-teman.py <källa> <mål>

Källan är en mapp med bilderna (jpg/png) eller enskilda filer. Filnamnet blir
temanyckeln: `pumpa.jpg` skrivs som `pumpa.webp`. Vill du byta ut ett motiv:
lägg den nya filen i mappen och kör skriptet igen — ingen kod behöver ändras.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

MAX_WIDTH = 1600
QUALITY = 74

# Nycklarna som temaprodukterna använder (se `src/lib/shop-catalog.ts`).
KEYS = ["pumpa", "spokhus", "haxkonst", "haunted-forest", "midnight"]


def kalla() -> Path:
    return Path(__file__).resolve().parent.parent


def hitta(kallmapp: Path, nyckel: str) -> Path | None:
    for suffix in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
        kandidat = kallmapp / f"{nyckel}{suffix}"
        if kandidat.exists():
            return kandidat
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2

    kallmapp = Path(argv[1])
    malmapp = Path(argv[2])
    malmapp.mkdir(parents=True, exist_ok=True)

    if not kallmapp.exists():
        print(f"Källmappen finns inte: {kallmapp}")
        return 1

    for nyckel in KEYS:
        fil = hitta(kallmapp, nyckel)
        if fil is None:
            print(f"SAKNAS: {nyckel}")
            continue

        bild = Image.open(fil).convert("RGB")
        if bild.width > MAX_WIDTH:
            hojd = round(bild.height * MAX_WIDTH / bild.width)
            bild = bild.resize((MAX_WIDTH, hojd), Image.LANCZOS)

        mal = malmapp / f"{nyckel}.webp"
        bild.save(mal, "WEBP", quality=QUALITY, method=6)
        # Ren ASCII i utskriften: Windows-konsolen använder cp1252 och kraschar
        # på tecken som ✓ och ×.
        print(
            f"OK {fil.name} -> {mal.name} "
            f"({mal.stat().st_size // 1024} kB, {bild.width}x{bild.height})"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
