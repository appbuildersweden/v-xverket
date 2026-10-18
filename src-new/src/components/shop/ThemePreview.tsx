import React from 'react';
import { themeBackground } from '../../lib/theme-media';

interface Props {
  themeKey: string;
  /** Temats namn, för skärmläsaren. */
  name: string;
  /** Sant när temat är det som används just nu. */
  active?: boolean;
}

/**
 * Förhandsvisning av ett tema.
 *
 * Provet är inte en bild av temat: det är appens egna komponenter (kort, knapp,
 * etikett och text) inuti en yta som har temats variabler. Därför ser eleven
 * exakt de färger och ytor som appen får — även om ett annat tema är aktivt
 * samtidigt, eftersom temat bara gäller inuti den här rutan.
 */
export const ThemePreview: React.FC<Props> = ({ themeKey, name, active = false }) => {
  const background = themeBackground(themeKey);

  return (
    <div
      className="sh-tema-preview"
      data-ui-tema={themeKey}
      data-testid={`sh-tema-preview-${themeKey}`}
      aria-hidden="true"
    >
      <div
        className="sh-tema-preview-bild"
        style={background ? { backgroundImage: `url(${background})` } : undefined}
      />
      <div className="sh-tema-preview-prov">
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">{name}</h2>
              <p className="card-sub">{active ? 'Används just nu' : 'Så här ser appen ut'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-primary" tabIndex={-1}>
              Knapp
            </button>
            <button type="button" className="btn btn-outline" tabIndex={-1}>
              Sekundär
            </button>
            <span className="pill">Etikett</span>
          </div>
        </div>
      </div>
    </div>
  );
};
