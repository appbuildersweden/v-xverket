import React from 'react';
import { Palette } from 'lucide-react';
import { halloweenIconFile } from '../../lib/halloween-icons';
import { themeBackground } from '../../lib/theme-media';
import { CATEGORY_META, ShopCategory } from '../../lib/shop-catalog';

interface Props {
  category: ShopCategory;
  assetKey?: string | null;
  themeKey?: string | null;
  /** Text för skärmläsare. Tom sträng betyder att bilden är dekorativ. */
  alt?: string;
  /** Storlek i pixlar för ikoner. */
  size?: number;
}

/**
 * Produktens bild.
 *
 * Alla bilder kommer från projektets egna filer: ikonarket för figurer, avatarer,
 * ramar, märken, dekorationer och effekter, och temabilderna för UI-temana.
 * Saknas en bild ritas kategorins symbol i stället för en trasig bild — butiken
 * visar aldrig en produkt utan bild som om den vore komplett.
 */
export const ProductArt: React.FC<Props> = ({
  category,
  assetKey,
  themeKey,
  alt = '',
  size = 72,
}) => {
  if (category === 'tema' && themeKey) {
    const background = themeBackground(themeKey);
    return (
      <div
        className="sh-tema-miniatyr"
        data-tema={themeKey}
        data-testid="sh-tema-miniatyr"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        style={background ? { backgroundImage: `url(${background})` } : undefined}
      />
    );
  }

  const src = assetKey ? halloweenIconFile(assetKey) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        style={{ maxWidth: size, maxHeight: size }}
      />
    );
  }

  return (
    <span className="sh-bild-saknas" title={CATEGORY_META[category]?.label} aria-hidden="true">
      <Palette size={Math.round(size / 2)} />
    </span>
  );
};
