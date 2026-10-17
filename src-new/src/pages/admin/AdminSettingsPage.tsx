import React from 'react';
import { Profil } from '../Profil';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Profil och inställningar för administratören.
 *
 * Sidan återanvänder appens gemensamma profilvy — samma kontouppgifter,
 * temaväljare, lösenordsbyte och utloggning som i de andra panelerna. Rollen
 * visas men kan aldrig ändras härifrån; ett rollbyte kräver en annan
 * administratör och sker under Roller och behörigheter.
 */
export const AdminSettingsPage: React.FC<Props> = ({ onNavigate }) => (
  <div data-testid="page-admin-installningar">
    <Profil panel="admin" onClose={() => onNavigate('start')} />
  </div>
);
