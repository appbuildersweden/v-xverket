import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme';
import { loadCurrentVersion } from './lib/update';
import './styles/globals.css';

// Läs in appens riktiga versionsnummer från Tauri direkt vid start, så att
// uppdateringsvyn och profilen visar det som faktiskt är installerat.
void loadCurrentVersion();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
