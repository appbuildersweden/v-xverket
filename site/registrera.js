/**
 * Elda – registreringssidan.
 *
 * Dom-delen av registreringsboten. All logik som går att pröva utan webbläsare
 * ligger i bot.js; här finns bara rendering och händelser. Frågorna, valideringen
 * och beslutet kommer från servern — den här filen visar dem och skickar svaren.
 *
 * Sidan är en chatt: boten ställer en fråga i taget, den sökande skriver sitt
 * svar (eller en fråga) i samma ruta, och snabbvalen under chatten är bara ett
 * bekvämare sätt att skriva samma svar.
 *
 * Ingen text från servern skrivs som HTML: allt sätts med textContent, så att
 * ett svar aldrig kan bli kod i sidan.
 */
import {
  KIND_DESCRIPTIONS,
  KIND_LABELS,
  KINDS,
  TRACKING_KEY,
  createBotClient,
  firstNameFrom,
  greetingReply,
  helpReply,
  looksLikeAccountRequest,
  looksLikeQuestion,
  newIdempotencyKey,
  parseChatAnswer,
  parseKind,
  questionFor,
  readConfig,
  validateNewPassword,
} from './bot.js?v=20261022-9';

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
  replying: false,
  name: '',
  values: {},
};

const nodes = {
  card: $('reg-card'),
  configError: $('reg-config-error'),
  chatStep: $('step-bot'),
  heading: $('bot-heading'),
  log: $('bot-log'),
  quick: $('bot-quick'),
  error: $('bot-error'),
  form: $('bot-form'),
  input: $('bot-input'),
  send: $('bot-send'),
  sendLabel: $('bot-send-label'),
  typing: $('bot-typing'),
  status: $('bot-status'),
  kindLabel: $('bot-kind'),
  passwordForm: $('password-form'),
  password: $('reg-password'),
  password2: $('reg-password-2'),
  terms: $('reg-terms'),
  summary: $('reg-summary'),
  statusForm: $('status-form'),
  statusOut: $('status-out'),
  resumeBtn: $('resume-btn'),
  resultStep: $('step-result'),
  resultHeading: $('result-heading'),
  resultBody: $('result-body'),
  resultRestart: $('result-restart'),
  resultSkola: $('result-skola'),
  deleteForm: $('delete-form'),
  deleteUsername: $('delete-username'),
  deletePassword: $('delete-password'),
  deleteConfirm: $('delete-confirm'),
  deleteSubmit: $('delete-submit'),
  deleteError: $('delete-error'),
  deleteOut: $('delete-out'),
};

let bot = null;
// Håller reda på förra hälsningen så att boten inte upprepar samma mening.
let lastGreetingIndex = -1;

/** Förnamnet, om boten har fått det. Används för att tilltala personen. */
function myName() {
  return state.name || firstNameFrom(state.values);
}

/** Skriver en rad i chatten. Allt är text, aldrig HTML. */
function say(role, message) {
  if (!nodes.log || !message) return;
  const row = document.createElement('div');
  row.className = `chat-row chat-row-${role}`;
  if (role === 'bot') {
    const avatar = document.createElement('img');
    avatar.className = 'chat-bubble-avatar';
    avatar.src = './assets/elda-icon.png';
    avatar.alt = '';
    avatar.width = 26;
    avatar.height = 26;
    row.appendChild(avatar);
  }
  row.appendChild(text('p', `reg-line reg-line-${role}`, message));
  nodes.log.appendChild(row);
  nodes.log.scrollTop = nodes.log.scrollHeight;
}

/** "Elda-boten skriver…" medan servern svarar. */
function setTyping(typing) {
  if (!nodes.typing) return;
  show(nodes.typing, typing);
  if (typing && nodes.log) nodes.log.scrollTop = nodes.log.scrollHeight;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Boten svarar inte i samma ögonblick som meddelandet skickas. Den "skriver"
 * först en kort stund — längre för längre svar, men aldrig mer än knappt en
 * sekund — så att chatten känns som en konversation i stället för ett formulär.
 */
function replyDelay(message) {
  return Math.min(950, 350 + String(message ?? '').length * 12);
}

async function botSays(messages) {
  const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
  if (!list.length) return;
  state.replying = true;
  try {
    for (const message of list) {
      setTyping(true);
      await wait(replyDelay(message));
      setTyping(false);
      say('bot', message);
      // Liten andhämtning mellan två botrader, så att de inte klistras ihop.
      if (list.length > 1) await wait(140);
    }
  } finally {
    setTyping(false);
    state.replying = false;
  }
}

function setError(node, message) {
  if (!node) return;
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
  if (nodes.sendLabel) nodes.sendLabel.textContent = busy ? 'Skickar…' : 'Skicka';
}

/** Snabbval under chatten: samma sak som att skriva svaret, ett tryck kortare. */
function setQuick(options) {
  if (!nodes.quick) return;
  clear(nodes.quick);
  if (!options.length) {
    show(nodes.quick, false);
    return;
  }
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    if (option.hint) button.title = option.hint;
    button.addEventListener('click', () => void handleMessage(option.value));
    nodes.quick.appendChild(button);
  }
  show(nodes.quick, true);
}

function setKindQuick() {
  setQuick(
    KINDS.map((kind) => ({
      label: KIND_LABELS[kind] ?? kind,
      value: kind,
      hint: KIND_DESCRIPTIONS[kind] ?? '',
    })),
  );
}

function setQuickFor(field) {
  if (!field) {
    setQuick([]);
    return;
  }
  if (field.type === 'boolean') {
    setQuick([
      { label: 'Ja', value: 'ja' },
      { label: 'Nej', value: 'nej' },
    ]);
    return;
  }
  if (field.type === 'choice') {
    setQuick((field.options ?? []).map((option) => ({ label: String(option), value: String(option) })));
    return;
  }
  setQuick([]);
}

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
  if (Array.isArray(data.riskFlags) && data.riskFlags.length > 0) {
    nodes.resultBody.appendChild(
      text(
        'p',
        'reg-note-text',
        'Boten flaggade något i ansökan. En administratör kan granska den i efterhand — kontot fungerar som vanligt.',
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
      text('p', 'reg-note-text', 'Logga in i plattformen med användarnamnet och lösenordet du valde.'),
    );
  }
  if (data.status === 'skapad') {
    nodes.resultBody.appendChild(
      text('p', 'reg-note-text', 'Kontot är godkänt — du kan logga in i plattformen direkt.'),
    );
  } else if (data.status === 'vantar') {
    nodes.resultBody.appendChild(
      text(
        'p',
        'reg-note-text',
        'Klassverktygen öppnas när en administratör har godkänt kontot. Du kan logga in i plattformen redan nu.',
      ),
    );
  }

  nodes.resultHeading.textContent = data.message || 'Ansökan är skickad';
  setTyping(false);
  show(nodes.chatStep, false);
  show(nodes.passwordForm, false);
  show(nodes.resultStep, true);
  setQuick([]);
}

/* ----------------------------- Chatten --------------------------------- */

/** Visar vilken kontotyp ansökan gäller i chattens rubrik. */
function setHeaderFor(kind) {
  if (nodes.kindLabel) {
    nodes.kindLabel.textContent = KIND_LABELS[kind] ?? kind;
    show(nodes.kindLabel, true);
  }
  if (nodes.status) nodes.status.textContent = 'Frågar och svarar direkt';
}

/** Botens hälsning: kontotypen är det första den frågar efter. */
async function greet() {
  await botSays([
    'Hej! Jag är Elda-boten och hjälper dig att skapa ett Elda-konto.',
    'Vilken typ av konto vill du ha?',
  ]);
  say(
    'system',
    'Du kan också ställa en fråga när som helst — till exempel "vad kostar det?".',
  );
  setKindQuick();
  nodes.input?.focus();
}

/** Frågar efter kontotypen — det svar som krävs innan ansökan kan börja. */
async function offerKinds(named = null) {
  const lines = ['Absolut — det fixar vi!', 'Vilken typ av konto vill du ha?'];
  if (named) {
    lines.push(
      `Du nämnde ${String(KIND_LABELS[named] ?? named).toLowerCase()}. Välj den om det stämmer — annars den typ som passar dig.`,
    );
  }
  await botSays(lines);
  setKindQuick();
}

/** Startar en ansökan för vald kontotyp och ställer den första frågan. */
async function begin(kind) {
  if (state.busy) return;
  setBusy(true);
  setError(nodes.error, null);
  setTyping(true);

  const label = KIND_LABELS[kind] ?? kind;
  const res = await bot.start(kind, newIdempotencyKey());
  setTyping(false);
  setBusy(false);

  if (!res.ok) {
    say('system', res.error);
    return;
  }

  state.kind = kind;
  state.trackingCode = res.data.trackingCode;
  state.fields = res.data.fields ?? [];
  state.values = {};
  state.name = '';
  state.complete = false;
  try {
    localStorage.setItem(TRACKING_KEY, state.trackingCode);
  } catch {
    /* utan lokal lagring går registreringen ändå */
  }

  setHeaderFor(kind);
  clear(nodes.log);
  show(nodes.passwordForm, false);
  show(nodes.resultStep, false);
  await botSays([
    `Då skapar vi ett konto åt dig som ${String(label).toLowerCase()}. Jag frågar en sak i taget.`,
    questionFor(state.fields[0] ?? {}, res.data.firstQuestion),
  ]);
  setCurrent(state.fields[0] ?? null);
}

/** Sätter frågan som väntar och de snabbval som hör till den. */
function setCurrent(field) {
  state.current = field ?? null;
  setError(nodes.error, null);
  setQuickFor(state.current);
  if (nodes.input) {
    nodes.input.placeholder = state.current
      ? 'Skriv ditt svar eller en fråga…'
      : 'Skriv ett meddelande…';
  }
  if (state.current) nodes.input?.focus();
}

/** Skickar ett svar på den väntande frågan och hämtar nästa. */
async function sendAnswer(field, value) {
  setBusy(true);
  setError(nodes.error, null);
  setTyping(true);
  const res = await bot.answerStep(state.trackingCode, field.id, value);
  setTyping(false);
  setBusy(false);

  if (!res.ok) {
    const own = res.problems?.[field.id];
    say('system', own || res.error);
    return;
  }

  state.values = res.data.answers ?? state.values;
  const given = firstNameFrom(state.values);
  if (given) state.name = given;

  if (!res.data.complete) {
    // Boten kommer ihåg namnet och använder det i fortsättningen, men bara när
    // servern har accepterat svaret.
    const name = myName();
    if (field.id === 'firstName' && name) {
      await botSays(`Trevligt att träffas, ${name}!`);
    } else if (field.id === 'lastName' && name) {
      await botSays(`Tack så mycket, ${name}!`);
    }
    if (res.data.question) await botSays(res.data.question);
    setCurrent(res.data.nextField ?? null);
    return;
  }

  await finishQuestions(res.data);
}

/** Sammanfattning före inskickandet: den sökande ska se vad som sparas. */
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

/** Alla frågor är besvarade: visa sammanfattningen och lösenordssteget. */
async function finishQuestions(data) {
  state.complete = true;
  state.current = null;
  setQuick([]);
  renderSummary(data);
  const name = myName();
  await botSays(
    data.question ||
      (name
        ? `Tack, ${name}! Nu återstår bara att du väljer ett lösenord.`
        : 'Tack! Nu återstår bara att du väljer ett lösenord.'),
  );
  if (Array.isArray(data.missingRequired) && data.missingRequired.length > 0) {
    say('system', `Innan vi kan skicka in behöver vi: ${data.missingRequired.join(', ')}.`);
  }
  show(nodes.passwordForm, true);
  nodes.password?.focus();
}

/**
 * Tar emot ett skrivet meddelande. Tre saker kan hända, i den här ordningen:
 *  - det är en fråga till boten och boten kan svara,
 *  - det är valet av kontotyp (innan ansökan har börjat),
 *  - det är svaret på frågan som väntar.
 */
async function handleMessage(raw) {
  const message = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!message || state.busy || state.replying) return;

  say('user', message);
  if (nodes.input) nodes.input.value = '';

  // "Kan jag få skapa konto?" ska alltid leda till frågan om kontotyp — även
  // när meddelandet redan nämner en typ, så att valet blir medvetet.
  if (!state.kind && looksLikeAccountRequest(message)) {
    await offerKinds(parseKind(message));
    return;
  }

  // Kontotypen går också att bara skriva, t.ex. "lärare".
  if (!state.kind) {
    const kind = parseKind(message);
    if (kind) {
      await begin(kind);
      return;
    }
  }

  const asked = looksLikeQuestion(message) ? helpReply(message) : null;
  if (asked) {
    await botSays(asked);
    // Innan ansökan har börjat ska kontotypen alltid finnas ett tryck bort.
    if (!state.kind) setKindQuick();
    return;
  }
  if (looksLikeQuestion(message)) {
    const name = myName();
    await botSays(
      `Det där är jag inte säker på${name ? `, ${name}` : ''}. Jag kan hjälpa till med konto, lösenord, klasskod och vad som händer med uppgifterna – skriv /hjälp så visar jag exempel, eller svara på frågan ovan.`,
    );
    if (!state.kind) setKindQuick();
    return;
  }

  if (state.complete) {
    say('system', 'Alla frågor är besvarade — välj lösenord och skicka in ansökan nedan.');
    return;
  }

  // Artigheter och hälsningar ska inte sparas som svar på en fråga (t.ex. som
  // förnamn). Boten kvitterar i stället och låter frågan ligga kvar.
  if (state.current && /^(hej|hejsan|tja|tjena|hallå|halla|god dag|godmorgon)\b/i.test(message)) {
    const name = myName();
    await botSays(
      name
        ? `Hej ${name}! Vi fortsätter där vi var — svara på frågan ovan när du är redo.`
        : 'Hej! Vi fortsätter där vi var — svara på frågan ovan när du är redo.',
    );
    return;
  }
  if (state.current && /^(tack|tackar|tusen tack|okej|ok|toppen)[!., ]*$/i.test(message)) {
    await botSays('Varsågod! Vi fortsätter där vi var.');
    return;
  }

  if (!state.kind || !state.trackingCode) {
    if (/^(hej|hejsan|tja|tjena|hallå|halla|god dag|godmorgon)\b/i.test(message)) {
      const greeting = greetingReply(lastGreetingIndex);
      lastGreetingIndex = greeting.index;
      await botSays(greeting.text);
      setKindQuick();
      return;
    }
    const kind = parseKind(message);
    if (kind) {
      await begin(kind);
      return;
    }
    await botSays(
      'Vilken typ av konto passar dig bäst: skolelev, privat elev eller lärare?',
    );
    setKindQuick();
    return;
  }

  if (!state.current) {
    say('system', 'Jag väntar på serverns nästa fråga. Försök igen om en stund.');
    return;
  }

  const parsed = parseChatAnswer(state.current, message);
  if (!parsed.ok) {
    say('system', parsed.error);
    return;
  }
  await sendAnswer(state.current, parsed.value);
}

/* --------------------------- Skicka in ansökan ------------------------- */
async function submitApplication(event) {
  event.preventDefault();
  if (state.busy || !state.trackingCode) return;

  const problem = validateNewPassword(nodes.password.value, nodes.password2.value);
  if (problem) {
    setError(nodes.error, problem);
    return;
  }
  if (!nodes.terms.checked) {
    setError(nodes.error, 'Du behöver godkänna användarvillkoren för att skapa kontot.');
    return;
  }

  setBusy(true);
  setError(nodes.error, null);
  const submitBtn = $('reg-submit');
  if (submitBtn) submitBtn.textContent = 'Skapar konto…';
  const res = await bot.submit(state.trackingCode, nodes.password.value);
  setBusy(false);
  if (submitBtn) submitBtn.textContent = 'Skicka in ansökan';

  if (!res.ok) {
    setError(nodes.error, res.error);
    if (res.problemsList) say('system', `Kvar att fylla i: ${res.problemsList.join(', ')}.`);
    return;
  }

  if (res.data.status === 'skapad' || res.data.status === 'vantar') {
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
  const username = nodes.deleteUsername?.value.trim() ?? '';
  const password = nodes.deletePassword?.value ?? '';

  setError(nodes.deleteError, null);
  if (!username) {
    setError(nodes.deleteError, 'Ange användarnamnet du fick när kontot skapades.');
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
  const res = await bot.deleteAccount(username, password);
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
  const res = await bot.status(code);
  setBusy(false);

  if (!res.ok) {
    try {
      localStorage.removeItem(TRACKING_KEY);
    } catch {
      /* ignoreras */
    }
    say('system', res.error);
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

  state.kind = res.data.kind;
  state.trackingCode = code;
  state.complete = false;
  const questions = await bot.questions(res.data.kind);
  state.fields = questions.ok ? questions.data.fields ?? [] : [];

  setHeaderFor(res.data.kind);
  clear(nodes.log);
  show(nodes.chatStep, true);
  show(nodes.resultStep, false);
  show(nodes.passwordForm, false);
  show(nodes.statusOut, false);
  await botSays([
    `Vi fortsätter din ansökan (${KIND_LABELS[res.data.kind] ?? res.data.kind}).`,
    res.data.message,
  ]);

  // Ett tomt svar betyder "säg vad som saknas": servern svarar med nästa
  // obesvarade fält, så en avbruten ansökan fortsätter rätt.
  const pending = await bot.answerMany(code, {});
  if (!pending.ok) {
    say('system', pending.error);
    setQuick([]);
    return;
  }
  state.values = pending.data.answers ?? {};
  state.name = firstNameFrom(state.values);
  if (pending.data.complete) {
    await finishQuestions(pending.data);
    return;
  }
  if (pending.data.question) await botSays(pending.data.question);
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
  } catch {
    showConfigError();
    return;
  }

  // Länken till plattformen visas bara när adressen är en godkänd https-adress.
  const skolaUrl = typeof config.skolaUrl === 'string' ? config.skolaUrl : '';
  if (nodes.resultSkola && /^https:\/\//i.test(skolaUrl)) {
    nodes.resultSkola.href = skolaUrl;
    nodes.resultSkola.rel = 'noopener';
    nodes.resultSkola.hidden = false;
  }

  show(nodes.card, true);
  show(nodes.chatStep, true);

  nodes.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleMessage(nodes.input?.value ?? '');
  });
  // Enter skickar, Shift+Enter ger en ny rad.
  nodes.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleMessage(nodes.input.value);
    }
  });
  nodes.passwordForm.addEventListener('submit', (event) => void submitApplication(event));
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

  void greet();
}

void main();
