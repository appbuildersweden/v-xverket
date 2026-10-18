import React from 'react';
import { useCosmetics } from '../../lib/cosmetics';
import { halloweenIconFile } from '../../lib/halloween-icons';

interface Props {
  /** Användarnamnet, för initialen när ingen avatar är köpt. */
  username: string;
  size?: number;
}

/**
 * Avataren i toppraden: bild, ram och märke.
 *
 * Allt är kosmetik som eleven själv har köpt och utrustat — inget visas förrän
 * det är utrustat, och ett köp av en figur skriver aldrig över avataren.
 * Saknas bilden (t.ex. för en äldre produkt) ritas initialen precis som förut.
 */
export const CosmeticAvatar: React.FC<Props> = ({ username, size = 34 }) => {
  const { equippedItem } = useCosmetics();

  const avatar = equippedItem('avatar');
  const frame = equippedItem('ram');
  const badge = equippedItem('marke');

  const avatarSrc = avatar?.assetKey ? halloweenIconFile(avatar.assetKey) : null;
  const badgeSrc = badge?.assetKey ? halloweenIconFile(badge.assetKey) : null;
  const ornamentSrc = frame?.ornamentKey ? halloweenIconFile(frame.ornamentKey) : null;
  const scale = size / 34;

  return (
    <>
      <span
        className="kosmetik-avatar"
        style={{ width: size, height: size }}
        data-testid="kosmetik-avatar"
        data-avatar={avatar?.slug ?? 'standard'}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt=""
            style={{ width: Math.round(24 * scale), height: Math.round(24 * scale) }}
          />
        ) : (
          <span className="kosmetik-avatar-initial" style={{ fontSize: Math.round(13 * scale) }}>
            {username.slice(0, 1).toUpperCase()}
          </span>
        )}

        {frame && (
          <span
            className="kosmetik-ram"
            data-ram={frame.slug}
            data-testid="kosmetik-ram"
            style={{ inset: -Math.round(4 * scale) }}
          >
            {ornamentSrc && <img className="kosmetik-ram-ornament" src={ornamentSrc} alt="" />}
          </span>
        )}
      </span>

      {badgeSrc && (
        <img
          className="kosmetik-marke"
          src={badgeSrc}
          alt=""
          data-testid="kosmetik-marke"
          title={badge?.name}
        />
      )}
    </>
  );
};
