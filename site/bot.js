/**
 * Elda – registreringsbotens klient.
 *
 * Ren logik utan DOM: den pratar med den publika serverfunktionen `register`
 * och äger ingenting själv. Frågorna, valideringen, beslutet och kontoskapandet
 * ligger på servern — här finns bara anropen, lösenordskontrollen och de små
 * hjälpare som sidan behöver.
 *
 * Därför kan den här filen aldrig välja roll, sätta en godkänd-status eller
 * skapa administratörsbehörighet: de fälten skickas aldrig, och servern skulle
 * inte läsa dem om de kom ändå. Rollen härleds av servern ur `kind`, som bara
 * är användarens val av kontotyp (skolelev, privat elev eller lärare).
 */
export const KINDS = ['skolelev', 'privat_elev', 'larare'];

export const KIND_LABELS = {
  skolelev: 'Skolelev',
  privat_elev: 'Privat elev',
  larare: 'Lärare',
};

export const KIND_DESCRIPTIONS = {
  skolelev:
    'Du går i skolan och vill kunna ansluta till din lärares klass med en klasskod.',
  privat_elev:
    'Du pluggar på egen hand. Du får de personliga studieverktygen och kan ansluta till en klass senare.',
  larare: 'Du undervisar och vill skapa egna klasser, uppgifter och material.',
};

/** Lösenordskravet är samma i klienten som i servern — bara ett tidigt filter. */
export const MIN_PASSWORD_LENGTH = 8;

export const FORBIDDEN_PASSWORDS = ['student123', 'losenord', 'password', '12345678'];

/**
 * Kontrollerar ett nytt lösenord innan det skickas. Servern kontrollerar det
 * igen; det här är bara för att användaren ska slippa ett onödigt anrop.
 */
export function validateNewPassword(password, confirmation, username = '') {
  if (!password) return 'Välj ett lösenord.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
  }
  if (password !== confirmation) return 'Lösenorden stämmer inte överens.';
  if (FORBIDDEN_PASSWORDS.includes(password.toLowerCase())) {
    return 'Det lösenordet är för vanligt. Välj ett eget.';
  }
  const name = String(username || '').trim().toLowerCase();
  if (name && password.toLowerCase() === name) {
    return 'Lösenordet får inte vara samma som ditt användarnamn.';
  }
  return null;
}

/** Frågan boten ställer för ett fält, med ett begripligt reservformulär. */
export function questionFor(field, fallback = '') {
  const text = String(fallback || '').trim();
  return text || `Ange ${String(field?.label || 'svaret').toLowerCase()}.`;
}

/** Gör om ett råvärde från formuläret till det servern förväntar sig för
 * fältets typ. Returnerar `{ ok: false, error }` när inmatningen inte går att
 * tolka, så att sidan kan visa det innan något skickas.
 */
export function answerValueFor(field, raw) {
  const type = field?.type;
  const text = typeof raw === 'string' ? raw.trim() : raw;

  if (type === 'number') {
    if (text === '' || text === null || text === undefined) return { ok: true, value: null };
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: 'Ange bara en siffra.' };
    return { ok: true, value: n };
  }

  if (type === 'boolean') {
    if (text === true || text === 'true' || text === 'ja') return { ok: true, value: true };
    if (text === false || text === 'false' || text === 'nej') return { ok: true, value: false };
    return { ok: false, error: 'Välj ja eller nej.' };
  }

  if (type === 'choice') {
    const list = Array.isArray(text) ? text : text === '' ? [] : [text];
    if (list.length === 0) return { ok: false, error: 'Välj minst ett alternativ.' };
    return { ok: true, value: list };
  }

  return { ok: true, value: typeof text === 'string' ? text : String(text ?? '') };
}

/**
 * Tolkar ett skrivet chattmeddelande som svar på botens fråga.
 *
 * Chatten har ingen kryssruta att klicka på, så svaren måste gå att skriva som
 * folk faktiskt skriver: "ja", "japp", "2", "speciallärare" eller
 * "Uppgifter och uppföljning, Planering". Servern validerar allt igen — det här
 * är bara för att ge ett begripligt svar direkt i chatten.
 */
export function parseChatAnswer(field, raw) {
  if (!field) return { ok: false, error: 'Jag väntar på en fråga först.' };

  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const skip = /^(\/hoppa|hoppa över|hoppa|skip)$/i.test(text);

  if (!text || skip) {
    return field.required
      ? { ok: false, error: `${field.label} behövs för att gå vidare.` }
      : { ok: true, value: '', skipped: true };
  }

  if (field.type === 'boolean') {
    if (/^(ja|japp|javisst|ja tack|absolut|visst|självklart|yes|y|1)$/i.test(text)) {
      return { ok: true, value: true };
    }
    if (/^(nej|nej tack|nä|nix|no|n|0)$/i.test(text)) {
      return { ok: true, value: false };
    }
    return { ok: false, error: 'Svara ja eller nej.' };
  }

  if (field.type === 'number') {
    const digits = text.replace(/[^\d]/g, '');
    if (!digits) return { ok: false, error: 'Ange bara en siffra, till exempel 24.' };
    const value = Number(digits);
    if (field.id === 'classSize' && (value < 1 || value > 60)) {
      return { ok: false, error: 'Ange ett antal mellan 1 och 60.' };
    }
    return { ok: true, value };
  }

  if (field.type === 'email') {
    const value = text.replace(/\s+/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) {
      return {
        ok: false,
        error: 'Skriv en e-postadress som namn@skola.se — eller /hoppa för att lämna den tom.',
      };
    }
    return { ok: true, value };
  }

  if (field.type === 'choice') {
    const options = Array.isArray(field.options) ? field.options : [];
    const picked = [];
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const option of options) {
      const needle = escape(String(option).toLowerCase());
      // Matcha hela ord, så att "speciallärare" inte också räknas som "lärare".
      if (new RegExp(`(^|[^a-zåäö])${needle}([^a-zåäö]|$)`, 'i').test(text)) {
        picked.push(option);
      }
    }

    if (picked.length === 0) {
      for (const match of text.matchAll(/\d+/g)) {
        const option = options[Number(match[0]) - 1];
        if (option && !picked.includes(option)) picked.push(option);
      }
    }

    if (picked.length === 0 && /\b(alla|allt|allting)\b/i.test(text)) {
      picked.push(...options);
    }

    // Ett kort svar som börjar på ett alternativ ska räcka: "planering" väljer
    // "Planering och att göra". Bara när det är entydigt.
    if (picked.length === 0) {
      const lower = text.toLowerCase();
      const starts = options.filter((option) => {
        const value = String(option).toLowerCase();
        return value.startsWith(lower) || lower.startsWith(value);
      });
      if (starts.length === 1) picked.push(starts[0]);
      else if (starts.length > 1) {
        return {
          ok: false,
          error: `Vilket av alternativen menar du: ${starts.join(', ')}?`,
        };
      }
    }

    if (picked.length === 0) {
      return {
        ok: false,
        error: options.length
          ? `Välj bland: ${options.join(', ')}.`
          : 'Svaret matchar inget alternativ.',
      };
    }

    // Rollen är ett enda val, även om fälttypen i övrigt tillåter flera.
    if (field.id === 'staffRole' && picked.length > 1) {
      return { ok: false, error: 'Välj en av rollerna: Lärare eller Speciallärare.' };
    }

    return { ok: true, value: picked };
  }

  return { ok: true, value: text };
}

/** Tolkar kontotypen ur ett skrivet meddelande. */
export function parseKind(raw) {
  const text = String(raw ?? '').toLowerCase();
  if (/privat/.test(text)) return 'privat_elev';
  if (/(lärare|larare|undervisar|teacher)/.test(text)) return 'larare';
  if (/(skolelev|elev|student|skola)/.test(text)) return 'skolelev';
  return null;
}

const ACCOUNT_REPLY =
  'Du skapar kontot här i chatten: jag frågar efter namn och några uppgifter, du väljer lösenord, och servern skapar kontot. Skriv ”skolelev”, ”privat elev” eller ”lärare” så börjar vi — eller fortsätt svara på frågan ovan.';

/** "Hur skapar jag ett konto?" men inte "Hur skapar jag en klass?". */
const WANTS_ACCOUNT_RE = /(skapa|skapar|skaffa|registrerar|registrera|ordna)[^.!?]{0,24}\bkonto\b|\bkonto\b[^.!?]{0,24}(skapa|skaffa|ordna)/i;

/** Frågor chatten kan svara på utan att blanda sig i ansökan. */
const HELP_RULES = [
  {
    keys: ['kostar', 'pris', 'gratis', 'betala', 'avgift', 'pengar'],
    reply:
      'Elda Skola är gratis för skolelever, privata elever och lärare. Det finns inget betalkort och ingen avgift i registreringen.',
  },
  {
    keys: ['lösenord', 'losenord', 'password'],
    reply:
      'Du väljer lösenord själv i slutet av registreringen, minst 8 tecken. Det får inte vara samma som användarnamnet eller ett vanligt standardlösenord. Användarnamnet skapas av servern.',
  },
  {
    keys: ['klasskod', 'klass kod'],
    reply:
      'Klasskoden får du av din lärare och är sex tecken, till exempel ABC234. Anger du den skickas en förfrågan — läraren måste godkänna den innan du ser klassens innehåll. Du kan hoppa över frågan och lägga till koden senare.',
  },
  {
    keys: ['speciallärare', 'speciallarare', 'undervisar', 'lärarkonto', 'lararkonto', 'granskas'],
    reply:
      'Boten skapar lärar- och speciallärarkonton direkt, med klassverktygen öppna. Underlaget sparas så att en administratör kan granska det i efterhand — du behöver inte vänta på något godkännande.',
  },
  {
    keys: ['hur lång tid', 'hur lang tid', 'hur länge', 'hur lange', 'hur snabbt', 'tar det'],
    reply:
      'Det tar oftast under en minut att svara på frågorna. Sedan skapas kontot direkt — du behöver inte vänta på något godkännande.',
  },
  {
    keys: ['vad händer sen', 'vad hander sen', 'vad händer efter', 'vad hander efter', 'efter registreringen'],
    reply:
      'När kontot är klart får du ett användarnamn och loggar in i Elda Skola med det och lösenordet du valde. Där finns uppgifter, planering, meddelanden och resten av menyvalen du kryssade i.',
  },
  {
    keys: ['ångra', 'angra', 'byta namn', 'ändra namn', 'andra namn', 'fel uppgift', 'rätta', 'ratta'],
    reply:
      'Uppgifterna kan ändras i efterhand: namn och profil under Profil i appen, och lösenordet via kontoinställningarna. Vill du börja om helt kan du ta bort kontot längre ner på den här sidan med din spårningskod och ditt lösenord.',
  },
  {
    keys: ['mobil', 'telefon', 'surfplatta', 'i appen'],
    reply:
      'Elda fungerar i mobilens och surfplattans webbläsare — du behöver inte installera något. Registreringen här fungerar lika bra på en liten skärm.',
  },
  {
    keys: ['integritet', 'personuppgift', 'gdpr', 'sparas', 'lagras', 'krypter', 'säker', 'saker', 'trygg', 'radera kontot', 'ta bort kontot', 'spårningskod'],
    reply:
      'Uppgifterna sparas hos Eldas server för att kunna skapa och administrera kontot, och sidan använder inga spårningskakor. Du kan ta bort kontot längre ner på sidan med din spårningskod och ditt lösenord.',
  },
  {
    keys: ['användarnamn', 'anvandarnamn'],
    reply:
      'Användarnamnet skapas av servern när kontot skapas, så du väljer det inte själv. Det visas när ansökan är klar.',
  },
  {
    keys: [
      'vilken typ',
      'vilket konto',
      'vilken ska jag',
      'vilken passar',
      'skillnad',
      'osäker',
    ],
    reply:
      'Skolelev: du går i skolan och har en klasskod från din lärare. Privat elev: du pluggar på egen hand och kan ansluta till en klass senare. Lärare: du undervisar och vill skapa klasser, uppgifter och material. Välj den som stämmer — du kan byta senare.',
  },
  {
    keys: ['hjälp', 'hjalp', 'vad kan du', 'vad gör du', 'hur funkar', 'fråga dig'],
    reply:
      'Jag ställer frågorna som behövs för kontot och svarar på frågor om registreringen. Skriv till exempel ”vad kostar det?”, ”hur får jag en klasskod?” eller ”vad händer med mina uppgifter?”.',
  },
  {
    keys: [
      'skapa konto',
      'skaffa konto',
      'få konto',
      'fa konto',
      'vill ha konto',
      'registrera mig',
      'bli medlem',
      'nytt konto',
    ],
    reply: ACCOUNT_REPLY,
  },
];

/** Förnamnet ur de sparade svaren, om det finns. Används för att boten ska
 * kunna tilltala personen vid namn i fortsättningen av samtalet. */
export function firstNameFrom(answers) {
  const value = answers?.firstName;
  return typeof value === 'string' ? value.trim() : '';
}

/** Hälsningar boten kan svara med. Ingen av dem utgår från att personen redan
 * har bestämt sig för att skapa ett konto. */
export const GREETINGS = [
  'Hej! Vad kan jag hjälpa dig med?',
  'Hej hej! Är du här för att skapa ett konto, eller har du en fråga?',
  'Hallå! Jag kan hjälpa dig med konto, lösenord och klasskod — vad vill du veta?',
  'Hej! Kul att du tittar in. Vill du komma igång med ett konto?',
];

/**
 * Väljer en hälsning som inte är samma som förra gången, så att boten inte
 * upprepar exakt samma mening varje gång någon skriver "hej".
 */
export function greetingReply(previousIndex = -1) {
  let index = Math.floor(Math.random() * GREETINGS.length);
  if (GREETINGS.length > 1 && index === previousIndex) {
    index = (index + 1) % GREETINGS.length;
  }
  return { text: GREETINGS[index], index };
}

/**
 * Sant för meddelanden som är en fråga till boten snarare än ett svar på
 * frågan. Kontrollen är medvetet försiktig: ett vanligt svar som "Klass 9A"
 * ska aldrig tolkas som en fråga.
 */
export function looksLikeQuestion(raw) {
  const text = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^\/(hjälp|hjalp)/.test(text)) return true;
  if (text.includes('?')) return true;
  if (
    /^(hur|vad|varför|varfor|när|nar|vilken|vilket|vilka|vem|kan jag|får jag|far jag|måste jag|maste jag|behöver jag|behover jag|går det|gar det|är det|ar det)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (/(skapa|skaffa|få|vill ha|behöver).{0,24}konto/.test(text)) return true;
  return false;
}

/** Sant när meddelandet är en begäran om att få skapa ett konto. */
export function looksLikeAccountRequest(raw) {
  const text = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return text ? WANTS_ACCOUNT_RE.test(text) : false;
}

/** Svaret på en fråga, eller null när ingen regel matchar. */
export function helpReply(raw) {
  const text = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  for (const rule of HELP_RULES) {
    if (rule.keys.some((key) => text.includes(key))) return rule.reply;
  }
  if (looksLikeAccountRequest(text)) return ACCOUNT_REPLY;
  return null;
}

/** Slumpad nyckel som gör ett omladdat formulär idempotent. */
export function newIdempotencyKey() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* faller igenom till reserven nedan */
  }
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `elda-${Date.now().toString(36)}-${rand()}${rand()}`;
}

const NETWORK_ERROR =
  'Kopplingen till servern misslyckades. Kontrollera din anslutning och försök igen.';

/** Tidsgräns som fungerar i alla webbläsare som sidan stöder. */
function timeoutSignal(ms) {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}
const UNEXPECTED_ERROR = 'Servern svarade oväntat. Försök igen.';
const THROTTLED = 'För många försök. Vänta en stund och försök igen.';

/**
 * Klienten mot serverfunktionen `register`.
 *
 * Alla svar kommer från servern; här finns ingen egen bedömning av ansökan.
 * Felöversättningen är densamma som appen använder, så att användaren får
 * serverns egna svenska meddelanden i stället för HTTP-koder.
 */
export function createBotClient({ supabaseUrl, anonKey, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const base = String(supabaseUrl || '').replace(/\/$/, '');

  if (!base || !anonKey) {
    throw new Error('Registreringen är inte konfigurerad (Supabase-adress och nyckel saknas).');
  }
  if (typeof doFetch !== 'function') {
    throw new Error('Webbläsaren kan inte nå servern (fetch saknas).');
  }

  async function request(path, body, timeoutMs = 15000) {
    let response;
    try {
      response = await doFetch(`${base}/functions/v1/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Den publika anon-nyckeln är samma som appen använder. Den ger ingen
          // behörighet i sig — RLS och serverfunktionen avgör vad som får göras.
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(body),
        // Ett svar som aldrig kommer ska inte lämna knappen låst för evigt.
        signal: timeoutSignal(timeoutMs),
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return {
          ok: false,
          error: 'Servern svarade inte i tid. Dina svar finns kvar — försök igen.',
          retryable: true,
        };
      }
      return { ok: false, error: NETWORK_ERROR, retryable: true };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 429) {
        return { ok: false, error: payload?.error || THROTTLED };
      }

      // Serverns egna meddelanden är skrivna för användaren. `problems` kan vara
      // ett fält-objekt (validering i `answer`) eller en lista (ofullständig
      // ansökan i `submit`) — båda måste nå fram, annars vet ingen vad som felas.
      const failure = { ok: false, error: '' };
      if (typeof payload?.error === 'string' && payload.error) {
        failure.error = payload.error;
      } else if (typeof payload?.message === 'string' && payload.message) {
        failure.error = payload.message;
      }

      if (Array.isArray(payload?.problems)) {
        failure.problemsList = payload.problems.map((p) => String(p));
      } else if (payload?.problems && typeof payload.problems === 'object') {
        failure.problems = payload.problems;
      }

      if (failure.error || failure.problems || failure.problemsList) {
        if (!failure.error) failure.error = 'Rätta det som markerats och försök igen.';
        return failure;
      }

      if (response.status === 404) {
        return {
          ok: false,
          error: 'Registreringen är inte aktiverad i backend ännu. Kontakta skolan.',
        };
      }
      return { ok: false, error: UNEXPECTED_ERROR };
    }

    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: UNEXPECTED_ERROR };
    }
    if (typeof payload.error === 'string' && payload.error) {
      return { ok: false, error: payload.error };
    }
    return { ok: true, data: payload };
  }

  const invoke = (body, timeoutMs) => request('register', body, timeoutMs);
  const invokeAccount = (body, timeoutMs) => request('account', body, timeoutMs);

  return {
    /** Hämtar frågorna för en kontotyp (och om AI-formulering är på). */
    questions(kind) {
      return invoke({ action: 'questions', kind });
    },

    /** Startar en ansökan. Samma nyckel ger samma ansökan (idempotens). */
    start(kind, idempotencyKey) {
      return invoke({ action: 'start', kind, idempotencyKey });
    },

    /** Skickar ett enskilt svar och får nästa fråga tillbaka. */
    answerStep(trackingCode, field, value) {
      return invoke({ action: 'answer', trackingCode, field, value });
    },

    /** Skickar flera svar samtidigt (formulärläget). */
    answerMany(trackingCode, answers) {
      return invoke({ action: 'answers', trackingCode, answers });
    },

    /** Skickar in ansökan med det valda lösenordet. AI-bedömningen kan ta
     * några sekunder, därför en något längre tidsgräns än för enskilda svar. */
    submit(trackingCode, password) {
      return invoke({ action: 'submit', trackingCode, password }, 25000);
    },

    /** Tar bort kontot med spårningskoden. Kräver lösenordet som verifiering. */
    deleteAccount(trackingCode, password) {
      return invokeAccount(
        { action: 'delete', trackingCode, password, confirm: true },
        25000,
      );
    },

    /** Hämtar ansökans status med spårningskoden. */
    status(trackingCode) {
      return invoke({ action: 'status', trackingCode });
    },
  };
}

/** Läser och kontrollerar den publika konfigurationen som bygget skriver. */
export function readConfig(raw) {
  const url = typeof raw?.supabaseUrl === 'string' ? raw.supabaseUrl.trim() : '';
  const anonKey = typeof raw?.supabaseAnonKey === 'string' ? raw.supabaseAnonKey.trim() : '';
  if (!url || !anonKey) return null;
  return { supabaseUrl: url, anonKey };
}

/** Spårningskoden sparas lokalt så att en avbruten ansökan kan fortsätta. */
export const TRACKING_KEY = 'elda-registration-code';
