import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme';
import './styles/globals.css';
import './styles/panels.css';
// Privatelevpanelens egna utseende. Filen är begränsad till [data-panel='privat']
// och rör därför inte övriga panelers gränssnitt.
import './styles/privat.css';
// Säsongens trädgård. Filen är scopad till .hh-klasser och rör inte övriga vyer.
import './styles/halloween.css';
// Firandet vid upplåsning och översikten Mina framsteg.
import './styles/celebrate.css';
// Shopens egna ytor (produktkort, dialog, samling och adminlistan).
import './styles/shop.css';
// De fem UI-temana. Filen sätter paletten via `data-ui-tema` på <html> och rör
// ingenting när inget tema är köpt.
import './styles/teman.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
