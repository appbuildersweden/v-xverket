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

/**
 * Demoläget finns bara i utvecklingsbygget. Grenen är alltid falsk i `dist`, så
 * Vite tar bort den (och därmed hela demo-modulen) ur produktionsbundeln.
 */
async function boot() {
  if (import.meta.env.DEV) {
    const { startDemoFromAddress } = await import('./demo/boot');
    await startDemoFromAddress();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void boot();
