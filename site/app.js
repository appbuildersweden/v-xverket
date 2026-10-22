/* Elda Skola – sidlogik för den publika webbplatsen.
   Varje del körs bara när dess element finns på sidan, så samma fil fungerar
   på alla sidor. Här finns tema, meny, animationer, länken till plattformen
   och förslagsformuläret. */

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
        io.unobserve(entry.target);
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
 * Läser config.json en gång. Filen skrivs av build.mjs och innehåller bara
 * publika värden (Supabase-adress, anon-nyckel och adressen till plattformen).
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

/* ------------------------------ Elda Skola ------------------------------ */
/**
 * Adressen kommer från config.json och bara när den är en godkänd https-adress.
 * Saknas den visas ett tydligt besked i stället för en knapp som ser ut att
 * fungera.
 */
function setupSkola(config) {
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
 * Förslag skickas till en anonym RPC i den delade databasen. Anon-nyckeln är
 * publik och ger bara rätt att anropa funktionen, inte att läsa tabellen.
 */
function setupFeedback(config) {
  const form = byId('feedback-form');
  if (!form) return;
  const submit = byId('fb-submit');
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

    if (product !== 'skola') {
      showStatus('Välj vad förslaget gäller.', 'error');
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
  setupSkola(config);
  setupFeedback(config);
}

void init();
