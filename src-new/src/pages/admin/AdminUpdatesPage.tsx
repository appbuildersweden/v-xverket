import React from 'react';
import { UpdateSettings } from '../../components/UpdateSettings';

/**
 * Uppdateringar i adminpanelen.
 *
 * Samma ruta som alla roller har i sina inställningar: den visar vilken version
 * som körs och låter administratören söka efter en nyare. Själva installationen
 * sker i den installerade appen, där signaturen verifieras av Tauri.
 */
export const AdminUpdatesPage: React.FC = () => (
  <div data-testid="page-admin-uppdateringar">
    <UpdateSettings />
  </div>
);
