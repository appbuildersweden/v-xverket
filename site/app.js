/* Elda – sidlogik. Ingen data hårdkodas här; allt versionsrelaterat
   hämtas från releases.json som genereras av build.mjs. */

const RELEASES_URL = new URL('./releases.json', import.meta.url);
const REPO_URL = 'https://github.com/appbuildersweden/v-xverket';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
const ext = (name) => (name.match(/\.[^.]+$/) || [''])[0];

function pickInstaller(release) {
  const assets = release.assets || [];
  return (
    assets.find((a) => /setup|installer/i.test(a.name) && /\.exe$/i.test(a.name)) ||
    assets.find((a) => /\.exe$/i.test(a.name)) ||
    assets[0] || null
  );
}

function renderEmpty() {
  $('#download-note').hidden = false;
  $('#download-btn').hidden = true;
  $('#download-facts').hidden = true;
  $('#download-sub').textContent = 'Ingen stabil version publicerad ännu.';
  $('#hero-version').textContent = '';
  $('#hero-meta').hidden = true;
}

function renderRelease(release) {
  const asset = pickInstaller(release);
  const version = release.tag || release.name;
  const size = asset ? fmtSize(asset.size) : null;

  $('#hero-version').textContent = version ? ` · VERSION ${version.replace(/^v/i, '')}` : '';
  $('#meta-version').textContent = version || '–';
  $('#meta-file').textContent = size ? `${asset.name} · ${size}` : (asset ? asset.name : '–');
  $('#meta-os').textContent = 'Windows 10/11 · 64-bit';
  $('#hero-meta').hidden = false;

  $('#download-sub').textContent = `Hämtas från officiella releaser · ${REPO_URL.replace('https://', '')}`;
  $('#dl-version').textContent = version || '–';
  $('#dl-date').textContent = release.publishedAt ? fmtDate(release.publishedAt) : '–';
  $('#dl-arch').textContent = asset?.os || 'Windows';
  $('#dl-file').textContent = asset
    ? `${asset.name}${size ? ` · ${size}` : ''}`
    : '–';
  $('#download-facts').hidden = false;

  if (asset?.url) {
    const btn = $('#download-btn');
    btn.href = asset.url;
    btn.hidden = false;
    $('#download-note').hidden = true;
    $('#step-ext').textContent = ext(asset.name) || '.exe';
  } else {
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

    renderRelease(releases.find((r) => !r.prerelease) || releases[0]);
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
