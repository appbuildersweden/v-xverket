# Halloween-trädgårdens media

## Temabilder (`teman/`)

De fem UI-temana använder en egen bakgrundsbild var:

| Fil | Tema | Produkt |
| --- | --- | --- |
| `teman/pumpa.webp` | Pumpatema | `tema-pumpa`, 300 XP |
| `teman/spokhus.webp` | Spökhus | `tema-spokhus`, 400 XP |
| `teman/haxkonst.webp` | Häxkonst | `tema-haxkonst`, 450 XP |
| `teman/haunted-forest.webp` | Haunted Forest | `tema-haunted-forest`, 500 XP |
| `teman/midnight.webp` | Midnight Halloween | `tema-midnight`, 600 XP |

Bilderna ligger lokalt i projektet och laddas aldrig från en extern adress. Ett
köpt tema fungerar därför även om en främmande webbplats ändras eller
försvinner. De används av `src/styles/teman.css` som `--tema-bakgrund` och
förhandsvisas av `src/components/shop/ThemePreview.tsx`.

Bilderna är tillhandahållna av projektägaren och omvandlas till WebP av
`scripts/forbered-teman.py` (samma motiv, mindre fil). **Licens och rätt att
distribuera bilderna behöver bekräftas av projektägaren innan de publiceras** —
en bild som går att visa är inte samma sak som en bild som får användas.
Saknas ett godkännande kan temat visas med bara sin palett: sätt
`--tema-bakgrund: none` i temats block i `teman.css`.

Dekorationerna i `teman.css` är frivilliga. Ett nytt tema behöver bara sin
palett, sin bild och en rad i `shop_products`.

| Fil | Roll |
| --- | --- |
| `halloween-bakgrund.webp` | Stillbilden (1536×1024). Visas medan videon laddar, och i stället för videon för den som har reducerad rörelse påslagen. |
| `halloween-video.mp4` | Bakgrundsvideon. 12 s, 1536×1024, H.264, **utan ljudspår**, sömlös loop. |

Videon hittas vid bygget av `src/lib/season-media.ts` (sökvägsmönstret
`halloween-video.*`), så en ny fil med samma namn börjar användas direkt. En
`.webm` fungerar lika bra vid sidan av. Vill du peka på en fil någon annanstans
sätter du `HALLOWEEN_BACKDROP_VIDEO` i samma fil till en egen sökväg.

Videon spelas alltid `muted`, `loop` och `playsInline`. Ljud finns inte med i
filen och ska inte läggas till: trädgården ska vara tyst.

## Källfilen

`haloween mp4/dl.mp4` i projektets rot har fel filändelse. Det är ingen video
utan en MP3 (Cozy Cottage, *Cozy Autumn Village Halloween Ambience*, 1 h 27 min,
128 kbit/s) med ett 500×500 stort omslag — 500 px brett motiv med svarta kanter,
alltså för litet att visa som bakgrund. Videon här är därför renderad ur
`halloween-bakgrund.webp`, samma motiv i 1536×1024.

## Så görs videon om

```bash
ffmpeg -loop 1 -i halloween-bakgrund.webp \
  -vf "scale=1536:1024,zoompan=z='1.015+0.06*(1-cos(2*PI*on/300))/2':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=300:s=1536x1024:fps=25" \
  -frames:v 300 -t 12 -an -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 25 -preset medium -movflags +faststart halloween-video.mp4
```

Zoomningen följer en cosinus över 300 bildrutor (12 s vid 25 fps), så första och
sista bildrutan ligger på samma zoomnivå — loopen möts utan hack. `-an` ser till
att filen inte får något ljudspår.
