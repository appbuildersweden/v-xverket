/* Elda – sidlogik. Ingen data hårdkodas här; allt versionsrelaterat
   hämtas från releases.json som genereras av build.mjs.

   Nedladdningen går aldrig direkt till en fil. Knappen loggar in mot samma
   serverfunktion som appen använder och hämtar sedan en kortlivad signerad
   länk från den skyddade nedladdningsfunktionen. */

import { createSiteClient } from './bot.js';

const RELEASES_URL = new URL('./releases.json', import.meta.url);
const REPO_URL = 'https://github.com/appbuildersweden/v-xverket';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------------- Nedladdning och inloggning ---------------------- */
let site = null;
let downloadReady = false;
let downloadBusy = false;

function setDownloadStatus(message) {
  const node = $('#dl-status');
  if (!node) return;
  node.textContent = message || '';
  node.hidden = !message;
}

function showLogin(message) {
  const form = $('#dl-login');
  const btn = $('#download-btn');
  if (form) form.hidden = false;
  if (btn) btn.textContent = 'Logga in för att ladda ner';
  setDownloadStatus(message || '');
}

function showLoggedIn(user) {
  const form = $('#dl-login');
  const btn = $('#download-btn');
  if (form) form.hidden = true;
  if (btn) btn.textContent = 'Ladda ner Elda för Windows';
  setDownloadStatus(
    user?.username ? `Inloggad som ${user.username}.` : '',
  );
}

async function handleDownload() {
  if (!site || downloadBusy) return;
  const user = site.peekUser();
  if (!user) {
    showLogin();
    return;
  }

  downloadBusy = true;
  setDownloadStatus('Förbereder nedladdningen…');
  const res = await site.download('exe');
  downloadBusy = false;

  if (!res.ok) {
    if (res.needsLogin) {
      await site.logout();
      showLogin(res.error);
      return;
    }
    if (res.pendingReview) {
      setDownloadStatus(
        'Kontot väntar på godkännande. Nedladdningen öppnas när en administratör har granskat ansökan.',
      );
      return;
    }
    setDownloadStatus(res.error);
    return;
  }

  setDownloadStatus(`Laddar ner ${res.data.fileName}…`);
  // Den signerade länken lever i två minuter och är bara giltig för den här filen.
  window.location.assign(res.data.url);
}

async function loginAndDownload(event) {
  event.preventDefault();
  if (!site) return;
  const username = $('#dl-user')?.value.trim() ?? '';
  const password = $('#dl-pass')?.value ?? '';
  if (!username || !password) {
    setDownloadStatus('Fyll i både användarnamn och lösenord.');
    return;
  }

  const button = $('#dl-login-btn');
  if (button) button.disabled = true;
  setDownloadStatus('Loggar in…');
  const res = await site.login(username, password);
  if (button) button.disabled = false;

  if (!res.ok) {
    setDownloadStatus(res.error);
    return;
  }

  const pass = $('#dl-pass');
  if (pass) pass.value = '';
  showLoggedIn(res.user);
  await handleDownload();
}

async function setupDownload() {
  const btn = $('#download-btn');
  const form = $('#dl-login');
  let config = null;

  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
    site = createSiteClient({
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
    });
  } catch (err) {
    console.warn('Nedladdningen: kunde inte läsa konfigurationen', err);
    site = null;
  }

  btn?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!downloadReady) return;
    if (!site) {
      setDownloadStatus(
        'Nedladdningen kan inte nås just nu. Försök igen om en stund eller kontakta skolan.',
      );
      return;
    }
    if (!site.peekUser()) showLogin();
    else void handleDownload();
  });

  form?.addEventListener('submit', (event) => void loginAndDownload(event));

  const user = site?.peekUser() ?? null;
  if (user) showLoggedIn(user);
  // Konfigurationen skickas med i stället för att läsas från en delad variabel:
  // då kan versionsrutan aldrig hamna i ett tillstånd där den saknar adress.
  await loadDownloadInfo(config);
}

/* ------------------------------- Tema ---------------------------------- */
const themeBtn = $('#theme-toggle');
const storedTheme = () => {
  try { return localStorage.getItem('elda-theme'); } catch { return null; }
};
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeBtn) {
    themeBtn.setAttribute(
      'aria-label',
      theme === 'mork' ? 'Växla till ljust läge' : 'Växla till mörkt läge',
    );
  }
}
applyTheme(document.documentElement.dataset.theme || (systemDark() ? 'mork' : 'ljus'));

themeBtn?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'mork' ? 'ljus' : 'mork';
  applyTheme(next);
  try { localStorage.setItem('elda-theme', next); } catch { /* privat läge */ }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
  if (storedTheme()) return;
  applyTheme(e.matches ? 'mork' : 'ljus');
});

/* ----------------------------- Navigering ------------------------------ */
const nav = $('#nav');
const menuBtn = $('#menu-btn');
const navLinks = $('#navlinks');

const onScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

function setMenu(open) {
  navLinks?.setAttribute('data-open', String(open));
  menuBtn?.setAttribute('aria-expanded', String(open));
  menuBtn?.setAttribute('aria-label', open ? 'Stäng meny' : 'Öppna meny');
}
menuBtn?.addEventListener('click', () =>
  setMenu(navLinks?.getAttribute('data-open') !== 'true'),
);
navLinks?.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});
addEventListener('click', (e) => {
  if (!navLinks || navLinks.getAttribute('data-open') !== 'true') return;
  if (!e.target.closest('#navlinks, #menu-btn')) setMenu(false);
});

/* ------------------------- Scrollanimationer --------------------------- */
const revealables = $$('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target); // visas bara en gång
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add('is-visible'));
}

/* --------------------------- Versionsdata ------------------------------ */
const fmtDate = (iso) => {
  try {
    return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(iso));
  } catch { return ''; }
};
const fmtSize = (bytes) => {
  if (!bytes) return null;
  const units = ['B', 'kB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};
let infoLoaded = false;

function renderEmpty() {
  if (infoLoaded) return;
  downloadReady = false;
  $('#download-note').hidden = false;
  $('#download-btn').hidden = true;
  $('#dl-login').hidden = true;
  setDownloadStatus('');
  $('#download-facts').hidden = true;
  $('#download-sub').textContent = 'Ingen stabil version publicerad ännu.';
  $('#hero-version').textContent = '';
  $('#hero-meta').hidden = true;
}

/**
 * Versionen hämtas från den skyddade funktionens publika info-läge — aldrig
 * från en publik filadress. Ingen länk lämnas ut här, bara siffrorna.
 */
async function loadDownloadInfo(config) {
  // config.json använder samma namn som appens bygge (supabaseUrl /
  // supabaseAnonKey) — inte klientens interna anonKey.
  const url = config?.supabaseUrl;
  const anonKey = config?.supabaseAnonKey;
  if (!url || !anonKey) {
    console.warn('Nedladdningen: serverkonfigurationen saknas');
    renderEmpty();
    return;
  }

  try {
    const base = String(url).replace(/\/$/, '');
    const res = await fetch(`${base}/functions/v1/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action: 'info' }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const info = await res.json();
    if (!info.available) {
      renderEmpty();
      return;
    }

    infoLoaded = true;
    const size = fmtSize(info.size);

    $('#download-sub').textContent = 'Kräver ett godkänt Elda-konto · Windows 10/11';
    $('#hero-version').textContent = ` · VERSION ${info.version}`;
    $('#hero-meta').hidden = false;
    $('#meta-version').textContent = info.version;
    $('#meta-file').textContent = size ? `${info.fileName} · ${size}` : info.fileName;
    $('#meta-os').textContent = 'Windows 10/11 · 64-bit';

    $('#dl-version').textContent = info.version;
    $('#dl-date').textContent = info.updatedAt ? fmtDate(info.updatedAt) : '–';
    $('#dl-arch').textContent = 'Windows';
    $('#dl-file').textContent = size ? `${info.fileName} · ${size}` : info.fileName;
    $('#download-facts').hidden = false;

    downloadReady = true;
    const btn = $('#download-btn');
    btn.hidden = false;
    btn.textContent = site?.peekUser() ? 'Ladda ner Elda för Windows' : 'Logga in för att ladda ner';
    $('#download-note').hidden = true;
    $('#step-ext').textContent = '.exe';
  } catch (err) {
    console.warn('Nedladdningen: kunde inte läsa versionen', err);
    renderEmpty();
  }
}

function renderTimeline(releases, sourceUrl) {
  const list = $('#timeline');
  if (!releases.length) return;

  const latestStable = releases.find((r) => !r.prerelease);
  list.innerHTML = '';

  for (const rel of releases) {
    const li = document.createElement('li');
    if (rel === latestStable) li.classList.add('is-latest');

    const head = document.createElement('div');
    head.className = 'rel-head';
    head.innerHTML = `
      <span class="rel-version"></span>
      <span class="rel-tag">${rel === latestStable ? 'Senaste stabila' : rel.prerelease ? 'Förhandsversion' : 'Tidigare version'}</span>
      <span class="rel-date"></span>`;
    $('.rel-version', head).textContent = rel.tag || rel.name || 'Okänd version';
    $('.rel-date', head).textContent = rel.publishedAt ? fmtDate(rel.publishedAt) : '';
    li.appendChild(head);

    if (rel.summary) {
      const p = document.createElement('p');
      p.className = 'rel-summary';
      p.textContent = rel.summary;
      li.appendChild(p);
    }

    if (rel.sections?.length) {
      const groups = document.createElement('div');
      groups.className = 'rel-groups';
      for (const section of rel.sections) {
        if (!section.items?.length) continue;
        const g = document.createElement('div');
        g.className = 'rel-group';
        const h = document.createElement('h4');
        h.textContent = section.heading;
        const ul = document.createElement('ul');
        for (const item of section.items) {
          const l = document.createElement('li');
          l.textContent = item;
          ul.appendChild(l);
        }
        g.append(h, ul);
        groups.appendChild(g);
      }
      li.appendChild(groups);
    }

    const link = document.createElement('p');
    link.style.marginTop = '13px';
    link.innerHTML = `<a class="text-link" rel="noopener">Visa release →</a>`;
    link.querySelector('a').href = rel.url || sourceUrl;
    li.appendChild(link);

    list.appendChild(li);
  }
}

function renderUpdater(active) {
  const status = $('#update-status');
  if (active) {
    status.hidden = true;
    return;
  }
  status.hidden = false;
  status.textContent =
    'Status: automatiska uppdateringar är ännu inte aktiva i appen. ' +
    'Stegen ovan beskriver hur uppdateringar kommer att fungera när funktionen är på plats.';
  $('#faq-update').textContent =
    'När funktionen är på plats jämför appen sin version med den publicerade och ' +
    'laddar ner en signerad uppdatering. Signaturen verifieras innan något installeras. ' +
    'Är funktionen ännu inte aktiverad laddar du ner den senaste filen manuellt här från sidan.';
}

async function loadReleases() {
  try {
    const res = await fetch(RELEASES_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const releases = Array.isArray(data.releases) ? data.releases : [];

    renderUpdater(data.updater === true);
    if (!releases.length) { renderEmpty(); return; }

    // Versionsrutan ritas av loadDownloadInfo (den skyddade funktionen). Här
    // visas bara historiken — aldrig en publik filadress.
    renderTimeline(releases, data.source || REPO_URL + '/releases');
    if (data.source) $('#all-releases').href = data.source;
  } catch {
    // Ingen data tillgänglig – visa ärligt tomtilstånd i stället för att gissa.
    renderEmpty();
    renderUpdater(false);
  }
}
loadReleases();

$('#year').textContent = String(new Date().getFullYear());

void setupDownload();
