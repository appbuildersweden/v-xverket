/* Elda – sidlogik för den publika webbplatsen. Varje del körs bara när dess
   element finns på sidan, så samma fil fungerar på alla sidor.

   Nedladdningen går aldrig direkt till en fil. Knappen loggar in mot samma
   serverfunktion som appen använder och hämtar sedan en kortlivad signerad
   länk från den skyddade nedladdningsfunktionen. */

import { createSiteClient } from './bot.js';

const REPO_URL = 'https://github.com/appbuildersweden/v-xverket';

const $ = (sel, root = document) => root.querySelector(sel);
const byId = (id) => document.getElementById(id);
const setText = (id, text) => {
  const node = byId(id);
  if (node) node.textContent = text ?? '';
};
const setHidden = (id, hidden) => {
  const node = byId(id);
  if (node) node.hidden = hidden;
};

/* ------------------------------- Tema ---------------------------------- */
const themeBtn = byId('theme-toggle');
const storedTheme = () => {
  try { return localStorage.getItem('elda-theme'); } catch { return null; }
};
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn?.setAttribute(
    'aria-label',
    theme === 'mork' ? 'Växla till ljust läge' : 'Växla till mörkt läge',
  );
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
const nav = byId('nav');
const menuBtn = byId('menu-btn');
const navLinks = byId('navlinks');

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
const revealables = [...document.querySelectorAll('.reveal')];
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

setText('year', String(new Date().getFullYear()));

/* ------------------------- Konfiguration ------------------------------- */
/**
 * Läser config.json en gång och delar resultatet mellan sidorna. Filen skrivs
 * av build.mjs och innehåller bara publika värden.
 */
let configPromise = null;
function loadSiteConfig() {
  configPromise ??= (async () => {
    try {
      const res = await fetch('./config.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (err) {
      console.warn('Kunde inte läsa config.json', err);
      return null;
    }
  })();
  return configPromise;
}

/* ----------------------------- Hjälpare -------------------------------- */
const fmtDate = (iso) => {
  try {
    return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(iso));
  } catch { return ''; }
};
const fmtSize = (bytes) => {
  if (!bytes) return null;
  const units = ['B', 'kB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

/* ------------------------ Nedladdning och konto ------------------------- */
let site = null;
let downloadReady = false;
let downloadBusy = false;
let infoLoaded = false;

function setDownloadStatus(message) {
  setText('dl-status', message || '');
  setHidden('dl-status', !message);
}

function showLogin(message) {
  setHidden('dl-login', false);
  setText('download-btn', 'Logga in för att ladda ner');
  setDownloadStatus(message || '');
}

function showLoggedIn(user) {
  setHidden('dl-login', true);
  setText('download-btn', 'Ladda ner Elda för Windows');
  setDownloadStatus(user?.username ? `Inloggad som ${user.username}.` : '');
}

async function handleDownload() {
  if (!site || downloadBusy) return;
  if (!site.peekUser()) {
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
  const username = byId('dl-user')?.value.trim() ?? '';
  const password = byId('dl-pass')?.value ?? '';
  if (!username || !password) {
    setDownloadStatus('Fyll i både användarnamn och lösenord.');
    return;
  }

  const button = byId('dl-login-btn');
  if (button) button.disabled = true;
  setDownloadStatus('Loggar in…');
  const res = await site.login(username, password);
  if (button) button.disabled = false;

  if (!res.ok) {
    setDownloadStatus(res.error);
    return;
  }

  const pass = byId('dl-pass');
  if (pass) pass.value = '';
  showLoggedIn(res.user);
  await handleDownload();
}

function renderDownloadEmpty() {
  if (infoLoaded) return;
  downloadReady = false;
  setHidden('download-note', false);
  setHidden('download-btn', true);
  setHidden('dl-login', true);
  setDownloadStatus('');
  setHidden('download-facts', true);
  setText('download-sub', 'Ingen stabil version publicerad ännu.');
  setHidden('hero-meta', true);
}

/**
 * Versionen hämtas från den skyddade funktionens publika info-läge. Ingen
 * filadress lämnas ut här, bara siffrorna.
 */
async function loadDownloadInfo(config) {
  const url = config?.supabaseUrl;
  const anonKey = config?.supabaseAnonKey;
  if (!url || !anonKey) {
    console.warn('Nedladdningen: serverkonfigurationen saknas');
    renderDownloadEmpty();
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
      renderDownloadEmpty();
      return;
    }

    infoLoaded = true;
    const size = fmtSize(info.size);
    const fileLine = size ? `${info.fileName} · ${size}` : info.fileName;

    setText('download-sub', 'Kräver ett godkänt Elda-konto · Windows 10/11');
    setHidden('hero-meta', false);
    setText('meta-version', info.version);
    setText('meta-file', fileLine);
    setText('meta-os', 'Windows 10/11 · 64-bit');

    setText('dl-version', info.version);
    setText('dl-date', info.updatedAt ? fmtDate(info.updatedAt) : '–');
    setText('dl-arch', 'Windows');
    setText('dl-file', fileLine);
    setHidden('download-facts', false);

    downloadReady = true;
    setHidden('download-btn', false);
    setText(
      'download-btn',
      site?.peekUser() ? 'Ladda ner Elda för Windows' : 'Logga in för att ladda ner',
    );
    setHidden('download-note', true);
    setText('step-ext', '.exe');
  } catch (err) {
    console.warn('Nedladdningen: kunde inte läsa versionen', err);
    renderDownloadEmpty();
  }
}

async function setupDownload(config) {
  const btn = byId('download-btn');
  const form = byId('dl-login');
  if (!btn) return; // inte nedladdningssidan

  // Registreringen är frivillig: utan serveradress visar knappen ett besked.
  if (config?.supabaseUrl && config?.supabaseAnonKey) {
    site = createSiteClient({
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
    });
  } else {
    site = null;
  }

  btn.addEventListener('click', (event) => {
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
  await loadDownloadInfo(config);
}

/* --------------------------- Versionsdata ------------------------------ */
function setTimelineMessage(message) {
  const list = byId('timeline');
  if (!list) return;
  list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'timeline-empty';
  li.textContent = message;
  list.appendChild(li);
}

function renderUpdater(active) {
  const status = byId('update-status');
  if (status) {
    status.hidden = active;
    status.textContent =
      'Status: automatiska uppdateringar är ännu inte aktiva i appen. ' +
      'Stegen ovan beskriver hur uppdateringar kommer att fungera när funktionen är på plats.';
  }
  setText(
    'faq-update',
    active
      ? 'Appen jämför sin version med den publicerade och hämtar en signerad uppdatering när en ny finns. Innan något installeras verifieras att paketet kommer från Elda och inte har ändrats.'
      : 'När funktionen är på plats jämför appen sin version med den publicerade och laddar ner en signerad uppdatering. Signaturen verifieras innan något installeras. Är funktionen ännu inte aktiverad laddar du ner den senaste filen manuellt från nedladdningssidan.',
  );
}

/** Visar senaste stabila version på startsidan, eller ett ärligt besked. */
function renderHomeLatest(releases, errorMessage) {
  if (!byId('home-latest-version')) return;
  const stable = releases.find((r) => !r.prerelease);
  if (stable) {
    setText('home-latest-version', stable.tag || stable.name || '');
    setText('home-latest-date', stable.publishedAt ? fmtDate(stable.publishedAt) : '');
    setText('home-latest-summary', stable.summary || '');
    setHidden('home-latest-summary', !stable.summary);
    setHidden('home-latest-note', true);
    setHidden('home-latest-date', !stable.publishedAt);
    return;
  }
  setText('home-latest-version', '–');
  setText('home-latest-date', '');
  setText('home-latest-summary', '');
  setHidden('home-latest-summary', true);
  setText(
    'home-latest-note',
    errorMessage || 'Ingen stabil version är publicerad ännu.',
  );
  setHidden('home-latest-note', false);
}

function renderTimeline(releases, sourceUrl) {
  const list = byId('timeline');
  if (!list) return;
  if (!releases.length) {
    setTimelineMessage('Inga versioner publicerade ännu. Den första versionen visas här så snart den är ute.');
    return;
  }

  const latestStable = releases.find((r) => !r.prerelease);
  list.innerHTML = '';

  for (const rel of releases) {
    const li = document.createElement('li');
    if (rel === latestStable) li.classList.add('is-latest');

    const head = document.createElement('div');
    head.className = 'rel-head';
    const version = document.createElement('span');
    version.className = 'rel-version';
    version.textContent = rel.tag || rel.name || 'Okänd version';
    const tag = document.createElement('span');
    tag.className = 'rel-tag';
    tag.textContent = rel === latestStable ? 'Senaste stabila' : rel.prerelease ? 'Förhandsversion' : 'Tidigare version';
    const date = document.createElement('span');
    date.className = 'rel-date';
    date.textContent = rel.publishedAt ? fmtDate(rel.publishedAt) : '';
    head.append(version, tag, date);
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

    const linkWrap = document.createElement('p');
    linkWrap.style.marginTop = '13px';
    const link = document.createElement('a');
    link.className = 'text-link';
    link.rel = 'noopener';
    link.href = rel.url || sourceUrl;
    link.textContent = 'Visa release →';
    linkWrap.appendChild(link);
    li.appendChild(linkWrap);

    list.appendChild(li);
  }
}

async function loadReleases() {
  const hasReleasePage = Boolean(byId('timeline') || byId('home-latest-version') || byId('update-status'));
  if (!hasReleasePage) return;
  try {
    const res = await fetch(new URL('./releases.json', import.meta.url), { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const releases = Array.isArray(data.releases) ? data.releases : [];
    const source = data.source || `${REPO_URL}/releases`;

    renderUpdater(data.updater === true);
    renderHomeLatest(releases);
    renderTimeline(releases, source);
    const all = byId('all-releases');
    if (all) all.href = source;
  } catch (err) {
    console.warn('Versionsdata kunde inte läsas', err);
    renderUpdater(false);
    renderHomeLatest([], 'Versionsinformationen kan inte hämtas just nu.');
    setTimelineMessage('Versionshistoriken kan inte hämtas just nu. Försök igen senare.');
  }
}

/* ------------------------------ Elda Skola ------------------------------ */
/**
 * Adressen kommer från config.json, som build.mjs skriver från ELDA_SKOLA_URL
 * och bara när adressen är godkänd. Saknas den visas ett ärligt besked, aldrig
 * en knapp som ser ut att fungera.
 */
async function setupSkola(config) {
  const url = typeof config?.skolaUrl === 'string' ? config.skolaUrl : '';
  const ok = /^https:\/\//i.test(url);

  for (const id of ['skola-open', 'home-skola-open']) {
    const cta = byId(id);
    if (!cta) continue;
    if (ok) {
      cta.href = url;
      cta.rel = 'noopener';
      cta.hidden = false;
    } else {
      cta.hidden = true;
    }
  }
  setHidden('skola-status', ok);
}

/* ------------------------------ Feedback -------------------------------- */
/**
 * Förslag skickas bara till en riktig mottagare (config.feedbackUrl, satt via
 * ELDA_FEEDBACK_URL vid bygget). Saknas den visar formuläret ett besked och
 * knappen är inaktiv — inget påstås vara sparat när det inte är det.
 */
function setupFeedback(config) {
  const form = byId('feedback-form');
  if (!form) return;
  const submit = byId('fb-submit');
  // Förslagen skickas till en anonym RPC i den delade databasen. Anon-nyckeln
  // är publik och ger bara rätt att anropa funktionen, inte att läsa tabellen.
  const base = typeof config?.supabaseUrl === 'string' ? config.supabaseUrl.replace(/\/$/, '') : '';
  const anonKey = typeof config?.supabaseAnonKey === 'string' ? config.supabaseAnonKey : '';
  const url = base && anonKey ? `${base}/rest/v1/rpc/submit_public_feedback` : '';
  const ready = /^https:\/\//i.test(url);

  const showStatus = (message, kind) => {
    const node = byId('fb-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.kind = kind;
    node.hidden = false;
  };

  if (!ready) {
    if (submit) submit.disabled = true;
    showStatus(
      'Förslag kan inte tas emot just nu. Formuläret aktiveras när en mottagare är konfigurerad.',
      'info',
    );
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const product = String(data.get('product') || '');
    const message = String(data.get('message') || '').trim();

    if (product !== 'elda' && product !== 'skola') {
      showStatus('Välj vilken produkt förslaget gäller.', 'error');
      return;
    }
    if (message.length < 10) {
      showStatus('Beskriv ditt förslag med minst 10 tecken.', 'error');
      return;
    }
    if (message.length > 2000) {
      showStatus('Förslaget får vara högst 2000 tecken.', 'error');
      return;
    }

    if (submit) submit.disabled = true;
    showStatus('Skickar…', 'info');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ p_product: product, p_message: message }),
      });
      if (!res.ok) {
        // Servern förklarar själv varför förslaget avvisades, på svenska.
        const body = await res.json().catch(() => null);
        showStatus(
          typeof body?.message === 'string'
            ? body.message
            : 'Förslaget kunde inte skickas. Försök igen om en stund.',
          'error',
        );
        return;
      }
      form.reset();
      showStatus('Tack! Ditt förslag är skickat.', 'ok');
    } catch (err) {
      console.warn('Förslaget kunde inte skickas', err);
      showStatus('Förslaget kunde inte skickas. Försök igen om en stund.', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

/* ------------------------------- Start ---------------------------------- */
async function init() {
  const config = await loadSiteConfig();
  await Promise.all([
    setupDownload(config),
    setupSkola(config),
    loadReleases(),
  ]);
  setupFeedback(config);
}

void init();
