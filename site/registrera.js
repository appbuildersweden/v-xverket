/**
 * Elda – registreringssidan.
 *
 * Dom-delen av registreringsboten. All logik som går att pröva utan webbläsare
 * ligger i bot.js; här finns bara rendering och händelser. Frågorna, valideringen
 * och beslutet kommer från servern — den här filen visar dem och skickar svaren.
 *
 * Ingen text från servern skrivs som HTML: allt sätts med textContent, så att
 * ett svar aldrig kan bli kod i sidan.
 */
import {
  KIND_DESCRIPTIONS,
  KIND_LABELS,
  KINDS,
  TRACKING_KEY,
  answerValueFor,
  createBotClient,
  createSiteClient,
  newIdempotencyKey,
  questionFor,
  readConfig,
  validateNewPassword,
} from './bot.js';

/* ------------------------------- Tema ---------------------------------- */
const themeBtn = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn?.setAttribute(
    'aria-label',
    theme === 'mork' ? 'Växla till ljust läge' : 'Växla till mörkt läge',
  );
}

applyTheme(document.documentElement.dataset.theme || 'ljus');
themeBtn?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'mork' ? 'ljus' : 'mork';
  applyTheme(next);
  try {
    localStorage.setItem('elda-theme', next);
  } catch {
    /* privat läge: temat lever bara i den här fliken */
  }
});

/* ----------------------------- Navigering ------------------------------ */
const nav = document.getElementById('nav');
const menuBtn = document.getElementById('menu-btn');
const navLinks = document.getElementById('navlinks');

function setMenu(open) {
  navLinks?.setAttribute('data-open', String(open));
  menuBtn?.setAttribute('aria-expanded', String(open));
  menuBtn?.setAttribute('aria-label', open ? 'Stäng meny' : 'Öppna meny');
}

const onScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });
menuBtn?.addEventListener('click', () => setMenu(navLinks?.getAttribute('data-open') !== 'true'));
navLinks?.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});
addEventListener('click', (event) => {
  if (!navLinks || navLinks.getAttribute('data-open') !== 'true') return;
  if (!event.target.closest('#navlinks, #menu-btn')) setMenu(false);
});

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ------------------------------- Hjälpare ------------------------------ */
const $ = (id) => document.getElementById(id);

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function text(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  return node;
}

function show(node, visible = true) {
  if (node) node.hidden = !visible;
}

/* --------------------------- Sidans tillstånd -------------------------- */
const state = {
  kind: null,
  trackingCode: null,
  fields: [],
  current: null,
  complete: false,
  busy: false,
  values: {},
};

const nodes = {
  card: $('reg-card'),
  configError: $('reg-config-error'),
  kindStep: $('step-kind'),
  kindPicker: $('kind-picker'),
  kindError: $('kind-error'),
  resumeBtn: $('resume-btn'),
  statusForm: $('status-form'),
  statusOut: $('status-out'),
  botStep: $('step-bot'),
  botHeading: $('bot-heading'),
  botFallback: $('bot-fallback'),
  botLog: $('bot-log'),
  botError: $('bot-error'),
  botForm: $('bot-form'),
  botField: $('bot-field'),
  botSend: $('bot-send'),
  allModeBtn: $('all-mode-btn'),
  allForm: $('all-form'),
  allFields: $('all-fields'),
  oneModeBtn: $('one-mode-btn'),
  passwordForm: $('password-form'),
  summary: $('reg-summary'),
  deleteForm: $('delete-form'),
  deleteCode: $('delete-code'),
  deletePassword: $('delete-password'),
  deleteConfirm: $('delete-confirm'),
  deleteSubmit: $('delete-submit'),
  deleteError: $('delete-error'),
  deleteOut: $('delete-out'),
  password: $('reg-password'),
  password2: $('reg-password-2'),
  terms: $('reg-terms'),
  resultStep: $('step-result'),
  resultHeading: $('result-heading'),
  resultBody: $('result-body'),
  resultRestart: $('result-restart'),
};

// Löpande id:n så att etiketter och inmatningar hör ihop även när samma fält
// visas både i frågeläget och i formulärläget.
let fieldSeq = 0;

let bot = null;
let siteClient = null;

function say(role, message) {
  nodes.botLog.appendChild(text('p', `reg-line reg-line-${role}`, message));
  nodes.botLog.scrollTop = nodes.botLog.scrollHeight;
}

function setError(node, message) {
  if (!message) {
    show(node, false);
    node.textContent = '';
    return;
  }
  node.textContent = message;
  show(node, true);
}

function setBusy(busy) {
  state.busy = busy;
  for (const button of nodes.card.querySelectorAll('button')) button.disabled = busy;
}

/**
 * Förklarar varför automatiken inte kunde bedöma ansökan.
 *
 * Servern skickar en kod (aldrig några driftdetaljer utöver att en kvot eller
 * kredit är slut) och sidan säger rakt ut vad det betyder för den sökande:
 * ansökan går till manuell granskning och nedladdningen öppnas först när någon
 * har godkänt den. Inget allmänt "något gick fel".
 */
const AI_ISSUE_NOTICE = {
  'kvot-slut':
    'AI-bedömningen kunde inte göras eftersom gratiskvoten för AI-tjänsten är slut just nu. Din ansökan går därför till manuell granskning — den är inte avslagen, men det kan ta lite längre tid.',
  'krediter-slut':
    'AI-bedömningen kunde inte göras eftersom AI-tjänsten saknar krediter just nu. Din ansökan går därför till manuell granskning — den är inte avslagen, men det kan ta lite längre tid.',
  'svar-uteblev':
    'AI-bedömningen kunde inte göras just nu. Din ansökan går därför till manuell granskning — den är inte avslagen, men det kan ta lite längre tid.',
};

/** Visar ansökans resultat eller status — alltid som text, aldrig som HTML. */
function renderResult(data) {
  clear(nodes.resultBody);

  if (data.username) {
    nodes.resultBody.appendChild(
      text('p', 'reg-result-line', `Ditt användarnamn: ${data.username}`),
    );
  }
  if (data.classCode) {
    nodes.resultBody.appendChild(
      text('p', 'reg-result-line', `Klasskod till klassen: ${data.classCode}`),
    );
  }
  if (data.classMessage) {
    nodes.resultBody.appendChild(text('p', 'reg-note-text', data.classMessage));
  }
  if (data.joinMessage) {
    nodes.resultBody.appendChild(text('p', 'reg-note-text', data.joinMessage));
  }
  const aiIssueNotice = data.aiIssue ? AI_ISSUE_NOTICE[data.aiIssue] : null;
  if (aiIssueNotice) {
    nodes.resultBody.appendChild(text('p', 'reg-note-warning', aiIssueNotice));
  }
  if (Array.isArray(data.riskFlags) && data.riskFlags.length > 0) {
    nodes.resultBody.appendChild(
      text(
        'p',
        'reg-note-text',
        'En administratör tittar på ansökan innan alla delar öppnas.',
      ),
    );
  }
  if (data.trackingCode) {
    nodes.resultBody.appendChild(
      text('p', 'reg-hint', `Spara din spårningskod: ${data.trackingCode}`),
    );
  }
  if (data.username) {
    nodes.resultBody.appendChild(
      text('p', 'reg-note-text', 'Logga in i appen med användarnamnet och lösenordet du valde.'),
    );
  }
  if (data.status === 'skapad') {
    nodes.resultBody.appendChild(
      text('p', 'reg-note-text', 'Kontot är godkänt — du kan ladda ner appen direkt via knappen nedan.'),
    );
  } else if (data.status === 'vantar') {
    nodes.resultBody.appendChild(
      text(
        'p',
        'reg-note-text',
        'Nedladdningen öppnas när en administratör har godkänt kontot. Du kan logga in i appen redan nu.',
      ),
    );
  }

  nodes.resultHeading.textContent = data.message || 'Ansökan är skickad';
  show(nodes.kindStep, false);
  show(nodes.botStep, false);
  show(nodes.passwordForm, false);
  show(nodes.resultStep, true);
}

/** Fältets inmatning byggs efter fälttypen som servern anger. */
function renderField(container, field) {
  clear(container);
  const wrapper = document.createElement('div');
  wrapper.className = 'reg-field';

  const id = `f-${field.id}-${++fieldSeq}`;
  const label = text('label', 'reg-label', field.label);
  label.htmlFor = id;
  wrapper.appendChild(label);
  if (field.hint) wrapper.appendChild(text('p', 'reg-hint', field.hint));

  let input;
  if (field.type === 'choice') {
    input = document.createElement('div');
    input.className = 'reg-choices';
    (field.options ?? []).forEach((option, index) => {
      const row = document.createElement('label');
      row.className = 'reg-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = option;
      if (index === 0) box.id = id;
      row.append(box, text('span', '', option));
      input.appendChild(row);
    });
  } else if (field.type === 'boolean') {
    input = document.createElement('div');
    input.className = 'reg-choices';
    [
      ['ja', 'Ja'],
      ['nej', 'Nej'],
    ].forEach(([value, caption], index) => {
      const row = document.createElement('label');
      row.className = 'reg-check';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = id;
      radio.value = value;
      if (index === 0) radio.id = id;
      row.append(radio, text('span', '', caption));
      input.appendChild(row);
    });
  } else if (field.type === 'longtext') {
    input = document.createElement('textarea');
    input.className = 'reg-input';
    input.rows = 4;
    input.maxLength = 1000;
    input.id = id;
  } else {
    input = document.createElement('input');
    input.className = 'reg-input';
    input.type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text';
    input.maxLength = 120;
    input.autocomplete = 'off';
    input.id = id;
  }

  // Fyll i det som redan är sparat (efter ett avbrott eller ett byte mellan
  // frågeläget och formulärläget) i stället för att visa tomma fält.
  const stored = state.values?.[field.id];
  if (stored !== undefined && stored !== null) {
    if (field.type === 'choice') {
      const list = (Array.isArray(stored) ? stored : [stored]).map(String);
      for (const box of input.querySelectorAll('input')) {
        box.checked = list.includes(box.value);
      }
    } else if (field.type === 'boolean') {
      const yes = stored === true || stored === 'true' || stored === 'ja';
      const target = input.querySelector(`input[value="${yes ? 'ja' : 'nej'}"]`);
      if (target) target.checked = true;
    } else {
      input.value = String(stored);
    }
  }

  wrapper.appendChild(input);
  const errorNode = text('p', 'reg-hint reg-hint-error', '');
  errorNode.hidden = true;
  wrapper.appendChild(errorNode);
  container.appendChild(wrapper);

  field.__errorNode = errorNode;
  field.__input = input;

  const first = input.querySelector?.('input') ?? input;
  first?.focus?.({ preventScroll: true });
  return input;
}

/** Läser av det användaren har skrivit för ett fält. */
function readField(field) {
  const input = field.__input;
  if (field.type === 'choice') {
    return [...input.querySelectorAll('input:checked')].map((box) => box.value);
  }
  if (field.type === 'boolean') {
    const checked = input.querySelector('input:checked');
    return checked ? checked.value : '';
  }
  return input.value;
}

/* ----------------------------- Frågeflödet ----------------------------- */
async function begin(kind) {
  if (state.busy) return;
  setBusy(true);
  setError(nodes.kindError, null);

  const res = await bot.start(kind, newIdempotencyKey());
  setBusy(false);

  if (!res.ok) {
    setError(nodes.kindError, res.error);
    return;
  }

  state.kind = kind;
  state.trackingCode = res.data.trackingCode;
  state.fields = res.data.fields ?? [];
  state.complete = false;
  try {
    localStorage.setItem(TRACKING_KEY, state.trackingCode);
  } catch {
    /* utan lokal lagring går registreringen ändå */
  }

  nodes.botHeading.textContent = `Registrering · ${KIND_LABELS[kind] ?? kind}`;
  show(nodes.botFallback, res.data.aiAvailable === false);
  clear(nodes.botLog);
  say('bot', `Hej! Vi fixar ett ${String(KIND_LABELS[kind] ?? '').toLowerCase()}-konto tillsammans.`);
  say('bot', questionFor(state.fields[0] ?? {}, res.data.firstQuestion));

  show(nodes.kindStep, false);
  show(nodes.botStep, true);
  show(nodes.resultStep, false);
  show(nodes.passwordForm, false);
  show(nodes.allForm, false);
  show(nodes.botForm, true);

  setCurrent(state.fields[0] ?? null);
}

function setSendLabel() {
  if (!nodes.botSend) return;
  // Ett frivilligt fält får lämnas tomt — då hoppar servern över det. Det står på
  // knappen, så ingen behöver gissa att ett tomt svar går bra.
  nodes.botSend.textContent = state.current?.required
    ? 'Skicka svar'
    : 'Skicka svar (tomt hoppar över)';
}

function setCurrent(field) {
  state.current = field;
  setError(nodes.botError, null);
  if (!field) {
    show(nodes.botForm, false);
    return;
  }
  renderField(nodes.botField, field);
  setSendLabel();
  show(nodes.botForm, true);
}

async function sendCurrent() {
  const field = state.current;
  if (!field || state.busy) return;

  const parsed = answerValueFor(field, readField(field));
  if (!parsed.ok) {
    field.__errorNode.textContent = parsed.error;
    field.__errorNode.hidden = false;
    return;
  }

  setBusy(true);
  setError(nodes.botError, null);
  // Direkt kvitto på att svaret skickats — innan servern hunnit svara.
  if (nodes.botSend) nodes.botSend.textContent = 'Skickar…';
  const res = await bot.answerStep(state.trackingCode, field.id, parsed.value);
  setBusy(false);
  setSendLabel();

  if (!res.ok) {
    const own = res.problems?.[field.id];
    if (own) {
      field.__errorNode.textContent = own;
      field.__errorNode.hidden = false;
      return;
    }
    setError(nodes.botError, res.error);
    return;
  }

  state.values = res.data.answers ?? state.values;
  show(nodes.botFallback, res.data.aiAvailable === false);

  if (!res.data.complete) {
    const next = res.data.nextField ?? null;
    if (res.data.question) say('bot', res.data.question);
    setCurrent(next);
    return;
  }

  finishQuestions(res.data);
}

/** Sammanfattning före inskickandet: användaren ska se vad som sparas. */
function renderSummary(data) {
  if (!nodes.summary) return;
  clear(nodes.summary);
  const values = state.values ?? {};
  const list = document.createElement('dl');
  list.className = 'reg-summary-list';

  for (const field of state.fields) {
    const value = values[field.id];
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (empty) continue;

    let shown;
    if (field.type === 'boolean') shown = value === true || value === 'true' ? 'Ja' : 'Nej';
    else if (Array.isArray(value)) shown = value.join(', ');
    else shown = String(value);

    list.appendChild(text('dt', '', field.label));
    list.appendChild(text('dd', '', shown));
  }

  nodes.summary.appendChild(list);
  if (data.summary) nodes.summary.appendChild(text('p', 'reg-hint', data.summary));
  show(nodes.summary, list.children.length > 0);
}

function finishQuestions(data) {
  state.complete = true;
  state.current = null;
  show(nodes.botForm, false);
  show(nodes.allForm, false);
  renderSummary(data);
  show(nodes.passwordForm, true);
  say('bot', data.question || 'Tack! Nu återstår bara ditt lösenord.');
  if (Array.isArray(data.missingRequired) && data.missingRequired.length > 0) {
    say('system', `Innan vi kan skicka in behöver vi: ${data.missingRequired.join(', ')}.`);
  }
}

async function sendAll() {
  if (state.busy) return;
  const answers = {};
  for (const field of state.fields) {
    const parsed = answerValueFor(field, readField(field));
    if (!parsed.ok) {
      field.__errorNode.textContent = parsed.error;
      field.__errorNode.hidden = false;
      return;
    }
    // Tomma frivilliga fält skickas med som null så att servern markerar dem som
    // överhoppade. Annars skulle frågan om ett frivilligt svar komma tillbaka och
    // ansökan aldrig kunna skickas in.
    if (parsed.value === '' || parsed.value === null) {
      if (!field.required) answers[field.id] = null;
      continue;
    }
    answers[field.id] = parsed.value;
  }

  setBusy(true);
  setError(nodes.botError, null);
  const res = await bot.answerMany(state.trackingCode, answers);
  setBusy(false);

  if (!res.ok) {
    setError(nodes.botError, res.error);
    if (res.problemsList) say('system', `Kvar att fylla i: ${res.problemsList.join(', ')}.`);
    return;
  }

  state.values = res.data.answers ?? state.values;
  show(nodes.allForm, false);
  if (res.data.complete) {
    finishQuestions(res.data);
    return;
  }
  show(nodes.botForm, true);
  say('bot', res.data.question || 'Tack!');
  if (Array.isArray(res.data.missingRequired) && res.data.missingRequired.length > 0) {
    say('system', `Kvar att fylla i: ${res.data.missingRequired.join(', ')}.`);
  }
  setCurrent(res.data.nextField ?? null);
}

/** Formulärläget: alla fält på en gång, utan den ena frågan i taget. */
function showAllMode() {
  clear(nodes.allFields);
  for (const field of state.fields) {
    const holder = document.createElement('div');
    nodes.allFields.appendChild(holder);
    renderField(holder, field);
  }
  show(nodes.botForm, false);
  show(nodes.allForm, true);
  setError(nodes.botError, null);
}

/* --------------------------- Skicka in ansökan ------------------------- */
async function submitApplication(event) {
  event.preventDefault();
  if (state.busy || !state.trackingCode) return;

  const problem = validateNewPassword(nodes.password.value, nodes.password2.value);
  if (problem) {
    setError(nodes.botError, problem);
    return;
  }
  if (!nodes.terms.checked) {
    setError(nodes.botError, 'Du behöver godkänna användarvillkoren för att skapa kontot.');
    return;
  }

  setBusy(true);
  setError(nodes.botError, null);
  const submitBtn = $('reg-submit');
  if (submitBtn) submitBtn.textContent = 'Skapar konto…';
  const res = await bot.submit(state.trackingCode, nodes.password.value);
  setBusy(false);
  if (submitBtn) submitBtn.textContent = 'Skicka in ansökan';

  if (!res.ok) {
    setError(nodes.botError, res.error);
    if (res.problemsList) say('system', `Kvar att fylla i: ${res.problemsList.join(', ')}.`);
    return;
  }

  if (res.data.status === 'skapad' || res.data.status === 'vantar') {
    // Samma konto som i appen: logga in direkt med uppgifterna som just valdes,
    // så att nedladdningen på startsidan kan öppnas utan en andra inloggning.
    if (siteClient && res.data.username) {
      try {
        await siteClient.login(res.data.username, nodes.password.value);
      } catch {
        /* inloggningen kan göras manuellt på nedladdningssidan */
      }
    }
    try {
      localStorage.removeItem(TRACKING_KEY);
    } catch {
      /* ignoreras */
    }
  }
  renderResult(res.data);
}

/* ---------------------------- Ta bort kontot --------------------------- */
async function deleteAccount(event) {
  event.preventDefault();
  if (!bot) return;
  const code = nodes.deleteCode?.value.trim() ?? '';
  const password = nodes.deletePassword?.value ?? '';

  setError(nodes.deleteError, null);
  if (!code) {
    setError(nodes.deleteError, 'Ange spårningskoden från din registrering.');
    return;
  }
  if (!password) {
    setError(nodes.deleteError, 'Ange kontots lösenord.');
    return;
  }
  if (!nodes.deleteConfirm?.checked) {
    setError(nodes.deleteError, 'Markera att du förstår att kontot tas bort.');
    return;
  }

  if (nodes.deleteSubmit) nodes.deleteSubmit.disabled = true;
  const res = await bot.deleteAccount(code, password);
  if (nodes.deleteSubmit) nodes.deleteSubmit.disabled = false;

  if (!res.ok) {
    setError(nodes.deleteError, res.error);
    return;
  }

  show(nodes.deleteOut, true);
  clear(nodes.deleteOut);
  nodes.deleteOut.appendChild(
    text(
      'p',
      'reg-note-text',
      res.data.alreadyDeleted
        ? 'Kontot var redan borttaget. Inga uppgifter finns kvar.'
        : 'Kontot är borttaget. Det går inte längre att logga in i Elda med dessa uppgifter.',
    ),
  );
  try {
    nodes.deleteForm.reset();
    localStorage.removeItem(TRACKING_KEY);
  } catch {
    /* ignoreras */
  }
}

/* ---------------------- Återuppta och kontrollera ---------------------- */

async function loadStatus(code) {
  if (!code || state.busy) return;
  setBusy(true);
  setError(nodes.kindError, null);
  const res = await bot.status(code);
  setBusy(false);

  show(nodes.statusOut, true);
  clear(nodes.statusOut);

  if (!res.ok) {
    nodes.statusOut.appendChild(text('p', 'reg-note-text', res.error));
    return;
  }

  const data = res.data;
  nodes.statusOut.appendChild(
    text('p', 'reg-note-text', `${KIND_LABELS[data.kind] ?? data.kind}: ${data.message}`),
  );
  if (data.username) {
    nodes.statusOut.appendChild(text('p', 'reg-result-line', `Användarnamn: ${data.username}`));
  }
  if (data.classCode) {
    nodes.statusOut.appendChild(text('p', 'reg-result-line', `Klasskod: ${data.classCode}`));
  }

  // En påbörjad ansökan kan fortsätta där den slutade.
  if (data.canContinue && data.status === 'utkast') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost';
    button.textContent = 'Fortsätt den här ansökan';
    button.addEventListener('click', () => void resume(code));
    nodes.statusOut.appendChild(button);
    return;
  }
  if (data.status === 'skapad' || data.status === 'vantar' || data.status === 'godkand') {
    try {
      localStorage.removeItem(TRACKING_KEY);
    } catch {
      /* ignoreras */
    }
  }
}

async function resume(code) {
  if (!code || state.busy) return;
  setBusy(true);
  setError(nodes.kindError, null);
  const res = await bot.status(code);
  setBusy(false);

  if (!res.ok) {
    try {
      localStorage.removeItem(TRACKING_KEY);
    } catch {
      /* ignoreras */
    }
    setError(nodes.kindError, res.error);
    return;
  }

  // Redan avgjord: visa resultatet i stället för att fråga igen.
  if (['skapad', 'vantar', 'godkand', 'nekad'].includes(res.data.status)) {
    renderResult({
      ...res.data,
      message: res.data.message,
    });
    return;
  }

  // Fortsätt fråga för fråga. Ett tomt svar betyder "säg vad som saknas": servern
  // svarar med nästa obesvarade fält, så en avbruten ansökan fortsätter rätt.
  state.kind = res.data.kind;
  state.trackingCode = code;
  const questions = await bot.questions(res.data.kind);
  state.fields = questions.ok ? questions.data.fields ?? [] : [];

  nodes.botHeading.textContent = `Registrering · ${KIND_LABELS[res.data.kind] ?? res.data.kind}`;
  clear(nodes.botLog);
  say('bot', `Vi fortsätter din ansökan (${KIND_LABELS[res.data.kind] ?? res.data.kind}).`);
  say('bot', res.data.message);

  show(nodes.kindStep, false);
  show(nodes.botStep, true);
  show(nodes.resultStep, false);
  show(nodes.passwordForm, false);
  show(nodes.allForm, false);

  const pending = await bot.answerMany(code, {});
  if (!pending.ok) {
    setError(nodes.botError, pending.error);
    show(nodes.botForm, false);
    return;
  }
  state.values = pending.data.answers ?? {};
  if (pending.data.complete) {
    finishQuestions(pending.data);
    return;
  }
  say('bot', pending.data.question || '');
  setCurrent(pending.data.nextField ?? null);
}

/* ------------------------------- Start --------------------------------- */
function showConfigError() {
  show(nodes.configError, true);
  show(nodes.card, false);
}

async function main() {
  let config = null;
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (res.ok) config = readConfig(await res.json());
  } catch {
    config = null;
  }
  if (!config) {
    showConfigError();
    return;
  }

  try {
    bot = createBotClient(config);
    siteClient = createSiteClient(config);
  } catch {
    showConfigError();
    return;
  }

  show(nodes.card, true);

  // Steg 1: kontotyperna byggs från samma lista som appen och servern känner.
  for (const kind of KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kind-option';
    button.appendChild(text('span', 'kind-option-label', KIND_LABELS[kind]));
    button.appendChild(text('span', 'kind-option-hint', KIND_DESCRIPTIONS[kind]));
    button.addEventListener('click', () => void begin(kind));
    nodes.kindPicker.appendChild(button);
  }

  nodes.botForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendCurrent();
  });
  nodes.allForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendAll();
  });
  nodes.passwordForm.addEventListener('submit', (event) => void submitApplication(event));
  nodes.allModeBtn.addEventListener('click', showAllMode);
  nodes.oneModeBtn.addEventListener('click', () => {
    show(nodes.allForm, false);
    // Rendera om frågan: annars pekar fältets inmatning kvar på formulärlägets
    // (nu dolda) element och svaret skulle läsas från fel ställe.
    setCurrent(state.current ?? state.fields[0] ?? null);
  });
  nodes.statusForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = $('status-code').value.trim();
    void loadStatus(code);
  });
  nodes.deleteForm?.addEventListener('submit', (event) => void deleteAccount(event));
  nodes.resultRestart.addEventListener('click', () => {
    location.reload();
  });

  let stored = null;
  try {
    stored = localStorage.getItem(TRACKING_KEY);
  } catch {
    stored = null;
  }
  if (stored) {
    show(nodes.resumeBtn, true);
    nodes.resumeBtn.addEventListener('click', () => void resume(stored));
  }
}

void main();
