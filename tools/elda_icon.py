"""Gör Elda-loggan transparent från den bifogade JPEG-filen.

Två varianter:
  elda-icon.png   – den rundade plattan behålls, bakgrunden runt om blir
                    genomskinlig (används som app-/webbikon)
  elda-flame.png  – bara flamman, helt transparent bakgrund

Originalet ändras inte.
"""
from PIL import Image, ImageFilter
import shutil
from pathlib import Path

SRC = Path(r"C:\Users\jenst\Downloads\elda ikon.jpeg")
OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)

TILE = (48, 48, 48)      # plattans färg
BG_MAX = 35              # lägre luminans än så här = bakgrund
OUT_SIZE = 1024          # källa för Tauri/Windows-ikoner
MARGIN = 0.06            # luft runt loggan i den fyrkantiga duken

im = Image.open(SRC).convert("RGB")
w, h = im.size
px = im.load()
lum = [[sum(px[x, y]) / 3 for x in range(w)] for y in range(h)]

# --- Variant 1: rundad platta, transparent bakgrund -------------------------
mask = Image.new("L", (w, h), 0)
mp = mask.load()
for y in range(h):
    for x in range(w):
        mp[x, y] = 255 if lum[y][x] >= BG_MAX else 0
# Liten blur gör övergången mjuk så att JPEG-blockigheten inte blir stege.
mask = mask.filter(ImageFilter.GaussianBlur(0.6))

# Bakgrunden får plattans färg så att ingen mörk halo följer med i alfan.
rgba = Image.new("RGBA", (w, h), TILE + (0,))
rp, op = rgba.load(), im.load()
for y in range(h):
    for x in range(w):
        rp[x, y] = op[x, y] + (mp[x, y],)

def square_with_margin(img: Image.Image) -> Image.Image:
    """Lägg bilden på en genomskinlig fyrkantig duk med luft runt om."""
    iw, ih = img.size
    side = int(max(iw, ih) * (1 + MARGIN * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - iw) // 2, (side - ih) // 2), img)
    return canvas

icon = square_with_margin(rgba).resize((OUT_SIZE, OUT_SIZE), Image.Resampling.BICUBIC)
icon.save(OUT / "elda-icon.png")

# --- Variant 2: bara flamman ------------------------------------------------
flame = Image.new("RGBA", (w, h), (255, 255, 255, 0))
fp = flame.load()
for y in range(h):
    for x in range(w):
        # Död zon under 60 så att JPEG-bruset i plattan inte blir en dimma.
        a = (lum[y][x] - 60) / (240 - 60)
        fp[x, y] = (255, 255, 255, 0 if a <= 0 else 255 if a >= 1 else int(a * 255))
flame_img = square_with_margin(flame).resize((OUT_SIZE, OUT_SIZE), Image.Resampling.BICUBIC)
flame_img.save(OUT / "elda-flame.png")

# --- Bevara originalet i projektet -----------------------------------------
shutil.copyfile(SRC, OUT / "elda-icon-original.jpeg")

# --- Rapport ---------------------------------------------------------------
for name in ("elda-icon.png", "elda-flame.png"):
    a = Image.open(OUT / name).split()[-1]
    corners = [a.getpixel(p) for p in [(2, 2), (OUT_SIZE - 3, 2), (2, OUT_SIZE - 3),
                                       (OUT_SIZE - 3, OUT_SIZE - 3), (OUT_SIZE // 2, OUT_SIZE // 2)]]
    print(f"{name}: {a.size[0]}x{a.size[1]} alfa hörn/mitten = {corners}")
print("klart ->", OUT)
