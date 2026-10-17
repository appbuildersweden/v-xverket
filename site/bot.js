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

/** Sessionen på webbplatsen. Samma konto som i appen — ingen andra inloggning. */
export const SESSION_KEY = 'elda-site-session';

function readStoredSession() {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(session) {
  try {
    if (session) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    else globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    /* privat läge: sessionen lever bara i den här fliken */
  }
}

/**
 * Klient för inloggning och skyddad nedladdning på webbplatsen.
 *
 * Inloggningen går genom samma serverfunktion som appen använder
 * (`auth-login`), så ett konto som skapades i registreringen fungerar direkt.
 * Nedladdningsfunktionen kräver en giltig session och ett godkänt konto; den
 * här klienten kan aldrig själv avgöra behörighet.
 */
export function createSiteClient({ supabaseUrl, anonKey, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base || !anonKey) throw new Error('Webbplatsen saknar serverkonfiguration.');
  if (typeof doFetch !== 'function') throw new Error('Webbläsaren kan inte nå servern.');

  async function post(path, body, token = anonKey, timeoutMs = 15000) {
    try {
      return await doFetch(`${base}/functions/v1/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: timeoutSignal(timeoutMs),
      });
    } catch {
      return null;
    }
  }

  async function refresh(session) {
    if (!session?.refresh_token) return null;
    try {
      const res = await doFetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
        signal: timeoutSignal(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.access_token || !data?.refresh_token) return null;
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at ?? null,
        user: data.user ?? session.user ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Giltig session, förnyad om den snart går ut. Null = ingen inloggning. */
  async function currentSession() {
    let session = readStoredSession();
    if (!session) return null;
    const expiresAt = Number(session.expires_at) * 1000;
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt - 30_000 < Date.now()) {
      session = await refresh(session);
      storeSession(session);
    }
    return session;
  }

  return {
    SESSION_KEY,

    /** Sparad användare utan nätverk, för att kunna rita rätt läge direkt. */
    peekUser() {
      return readStoredSession()?.user ?? null;
    },

    async login(username, password) {
      const res = await post('auth-login', { username, password });
      if (!res) {
        return { ok: false, error: NETWORK_ERROR };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        if (res.status === 429) {
          return { ok: false, error: data?.error || THROTTLED };
        }
        return {
          ok: false,
          error: data?.error || 'Fel användarnamn eller lösenord.',
          mustChangePassword: data?.mustChangePassword === true,
        };
      }
      if (!data?.access_token || !data?.refresh_token) {
        return { ok: false, error: 'Inloggningen kunde inte slutföras. Försök igen.' };
      }
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at ?? null,
        user: data.user ?? null,
      };
      storeSession(session);
      return { ok: true, user: session.user };
    },

    async logout() {
      storeSession(null);
    },

    /**
     * Begär en signerad nedladdningslänk. Servern kontrollerar kontot; ett
     * begränsat (väntande) konto får `pendingReview` i stället för en länk.
     */
    async download(format = 'exe') {
      let session = await currentSession();
      if (!session) {
        return {
          ok: false,
          needsLogin: true,
          error: 'Logga in med kontot du skapade i registreringen för att ladda ner.',
        };
      }

      let res = await post('download', { format }, session.access_token);
      if (res?.status === 401) {
        session = await refresh(session);
        storeSession(session);
        if (!session) {
          return {
            ok: false,
            needsLogin: true,
            error: 'Sessionen har gått ut. Logga in igen.',
          };
        }
        res = await post('download', { format }, session.access_token);
      }
      if (!res) {
        return { ok: false, error: NETWORK_ERROR };
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          error: data?.error || 'Nedladdningen är inte tillgänglig just nu.',
          pendingReview: data?.pendingReview === true,
          needsLogin: res.status === 401,
        };
      }
      return { ok: true, data };
    },
  };
}