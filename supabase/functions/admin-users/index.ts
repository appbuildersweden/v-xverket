// Växverket — admin-users
// Skyddad administratörsfunktion: skapar, listar och aktiverar/inaktiverar
// konton. Behörigheten verifieras serversidigt mot den anropandes JWT
// (app_metadata.role) — klienten kan aldrig ge sig själv admin-rollen.
//
// Deploy:  supabase functions deploy admin-users
// (verify_jwt ska vara på så att bara inloggade kan anropa.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

// Roller som en administratör får skapa direkt. Anropet kräver redan en
// verifierad administratörssession, och varje skapat konto loggas. Adminrollen
// kan dessutom tilldelas i efterhand via den separata åtgärden `set-role`.
const CREATABLE_ROLES = ['admin', 'lärare', 'speciallärare', 'elev'];
// Roller som får tilldelas genom `set-role` — fortfarande bara av en admin som
// redan är administratör enligt sin JWT.
const ASSIGNABLE_ROLES = ['admin', 'lärare', 'speciallärare', 'elev'];
const MIN_PASSWORD_LENGTH = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Slumpar ett tillfälligt lösenord. Det returneras en gång till administratören
 * (så att hen kan lämna det vidare) och sparas aldrig i klartext — varken i
 * databasen, i loggen eller i svaret efteråt. Användaren måste byta det vid
 * första inloggningen, vilket styrs av must_change_password.
 */
function generateTempPassword(): string {
  // Tecken som är lätta att läsa upp och skriva av, utan I/O/0/1.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/** Normalisering: å/ä/ö -> a/a/o, gemener, endast a-z0-9. */
const SV: Record<string, string> = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  'ý': 'y', 'ÿ': 'y', 'ñ': 'n', 'ç': 'c', 'š': 's', 'ž': 'z', 'đ': 'd', 'ð': 'd', 'þ': 'p',
};

function letters(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => SV[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Skolans fastställda namn. Grundregeln är e + 3 bokstäver av förnamnet + 2 av
 * efternamnet, men för dessa namn har skolan bestämt en annan förkortning och
 * den ska alltid gälla. Nyckeln är normaliserade bokstäver (gemener, a-z).
 * Löpnumret läggs på efteråt precis som vanligt.
 */
const NAME_OVERRIDES: Record<string, string> = {
  'jens|turesson': 'ejentu',
  'anna|andersson': 'eannaad',
  'lisa|karlsson': 'elisaka',
  'erik|nilsson': 'eerikni',
};

/** 'e' + 3 bokstäver av förnamnet + 2 av efternamnet (+ löpnummer senare). */
function usernameBase(first: unknown, last: unknown): string {
  const override = NAME_OVERRIDES[`${letters(first)}|${letters(last)}`];
  if (override) return override;

  let f = letters(first);
  let l = letters(last);
  if (!f && !l) f = 'elev';
  f = (f.slice(0, 3) + 'xxx').slice(0, 3);
  l = (l.slice(0, 2) + 'xx').slice(0, 2);
  return `e${f}${l}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Metod tillåts inte.' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  // Verifiera anropandens JWT (signatur + giltighet) med den publika klienten.
  const token =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!token) {
    return json({ error: 'Inloggning krävs.' }, 401);
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerErr } = await anon.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return json({ error: 'Din session är ogiltig eller utgången.' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: {
    action?: string;
    username?: string;
    password?: string;
    role?: string;
    userId?: string;
    active?: boolean;
    limited?: boolean;
    firstName?: string;
    lastName?: string;
    mustChangePassword?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  // ------------------------------------------------------------
  // Lösenordsbytet klart — anropas av den inloggade användaren själv efter att
  // Supabase Auth har sparat det nya lösenordet. Flaggan nollas serversidigt,
  // så det går inte att hoppa över steget genom att bara ladda om appen.
  // (Kontrolleras före admin-kravet — varje inloggad får stänga sin egen flagga.)
  // ------------------------------------------------------------
  if (body.action === 'password-changed') {
    const selfId = callerData.user.id;
    const { error: clearErr } = await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', selfId);
    if (clearErr) {
      return json({ error: 'Kunde inte uppdatera kontot. Försök igen.' }, 500);
    }
    const merged = {
      ...(callerData.user.app_metadata ?? {}),
      must_change_password: false,
    };
    await admin.auth.admin.updateUserById(selfId, { app_metadata: merged });
    return json({ ok: true });
  }

  // Rollen läses från JWT:ns app_metadata, som bara serversidan kan skriva.
  const callerRole = callerData.user.app_metadata?.role;
  if (callerRole !== 'admin') {
    return json({ error: 'Endast administratörer får göra detta.' }, 403);
  }

  // ------------------------------------------------------------
  // Föreslå användarnamn (förnamn + efternamn -> nästa lediga namn)
  // ------------------------------------------------------------
  if (body.action === 'suggest-username') {
    const firstName = (body.firstName ?? '').trim();
    const lastName = (body.lastName ?? '').trim();
    if (!firstName && !lastName) {
      return json({ username: '' });
    }
    const base = usernameBase(firstName, lastName);

    // Hämta befintliga namn med samma förkortning och välj nästa lediga nummer.
    const { data: taken, error: takenErr } = await admin
      .from('profiles')
      .select('username')
      .like('username', `${base}%`);
    if (takenErr) {
      return json({ error: 'Kunde inte kontrollera användarnamn.' }, 500);
    }
    const used = new Set((taken ?? []).map((r) => String(r.username)));
    for (let n = 1; n <= 99; n++) {
      const candidate = `${base}${String(n).padStart(2, '0')}`;
      if (!used.has(candidate)) return json({ username: candidate });
    }
    return json({ error: 'Alla löpnummer för detta namn är upptagna.' }, 409);
  }

  // ------------------------------------------------------------
  // Skapa konto
  // ------------------------------------------------------------
  if (body.action === 'create') {
    const firstName = (body.firstName ?? '').trim();
    const lastName = (body.lastName ?? '').trim();
    const role = body.role ?? '';
    // Skickas inget lösenord med genereras ett slumpat tillfälligt lösenord som
    // bara visas en gång för administratören.
    const generated = !body.password;
    const password = body.password ? body.password : generateTempPassword();
    // Explicit namn används bara när den administrativa vägen reserverar ett
    // bestämt namn (t.ex. ejentu01). Annars genereras namnet alltid.
    const explicit = (body.username ?? '').trim().toLowerCase();

    if (!CREATABLE_ROLES.includes(role)) {
      return json(
        {
          error:
            'Den rollen kan inte skapas här. Administratörsrollen tilldelas i stället under Roller och behörigheter.',
        },
        400,
      );
    }
    if (!explicit && !firstName && !lastName) {
      return json({ error: 'Ange förnamn och efternamn.' }, 400);
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: 'Lösenordet måste vara minst 8 tecken.' }, 400);
    }
    if (explicit && !USERNAME_RE.test(explicit)) {
      return json({ error: 'Användarnamnet är ogiltigt.' }, 400);
    }

    const base = usernameBase(firstName, lastName);
    const mustChange = body.mustChangePassword !== false;
    // Kontoutrymmet för namnet hämtas en gång; sedan avgör den unika
    // e-postadressen i Auth vem som hinner först vid samtidiga anrop.
    const { data: takenRows } = await admin
      .from('profiles')
      .select('username')
      .like('username', explicit ? explicit : `${base}%`);
    const used = new Set((takenRows ?? []).map((r) => String(r.username)));

    const candidates: string[] = [];
    if (explicit) {
      candidates.push(explicit);
    } else {
      for (let n = 1; n <= 99 && candidates.length < 99; n++) {
        const c = `${base}${String(n).padStart(2, '0')}`;
        if (!used.has(c)) candidates.push(c);
      }
    }
    if (candidates.length === 0) {
      return json({ error: 'Alla löpnummer för detta namn är upptagna.' }, 409);
    }

    for (const username of candidates) {
      // Intern e-postidentifierare (Supabase Auth kräver e-postformat).
      // Användaren loggar aldrig in med den — bara användarnamn + lösenord.
      const email = `${username}@vaxverket.local`;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // ingen e-postverifiering krävs
        app_metadata: {
          username,
          role,
          active: true,
          must_change_password: mustChange,
          // Konton som skapas här är skolkonton (skolelev). Privata elever
          // kommer via registreringsboten.
          account_type: 'skola',
        },
        user_metadata: { username, first_name: firstName, last_name: lastName },
      });

      if (createErr || !created?.user) {
        const msg = String(createErr?.message ?? '');
        // Namnet togs av någon annan — prova nästa löpnummer. Den unika
        // e-postadressen i Auth gör detta transaktionssäkert.
        if (/already|exists|duplicate|registered/i.test(msg)) continue;
        return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
      }

      const { error: profileErr } = await admin.from('profiles').insert({
        id: created.user.id,
        username,
        role,
        active: true,
        first_name: firstName || null,
        last_name: lastName || null,
        must_change_password: mustChange,
        // Konton som skapas av en administratör är skolkonton.
        account_type: 'skola',
      });
      if (profileErr) {
        // Städa upp så inget halvskapat konto blir kvar och prova nästa namn.
        try {
          await admin.auth.admin.deleteUser(created.user.id);
        } catch {
          /* ignorera */
        }
        if (/duplicate|unique/i.test(String(profileErr.message ?? ''))) continue;
        return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
      }

      // Spåret ska visa vem som skapade kontot och med vilken roll — aldrig
      // lösenordet. Loggfelet får inte fälla ett konto som redan är skapat.
      await admin.rpc('log_audit', {
        p_action: 'account.created',
        p_subject_type: 'user',
        p_subject_id: created.user.id,
        p_details: { username, role, account_type: 'skola' },
      });

      // Ett eget lösenord som administratören har valt loggas eller sparas
      // aldrig. Ett genererat lösenord visas en gång här, så att administratören
      // kan lämna det vidare — efteråt finns det inte i klartext någonstans.
      return json(
        {
          // Kontots id behövs för att kunna koppla det till en skola direkt
          // efter skapandet, utan en extra läsning av kontolistan.
          id: created.user.id,
          username,
          role,
          mustChangePassword: mustChange,
          initialPassword: generated ? password : null,
        },
        201,
      );
    }

    return json({ error: 'Användarnamnet är upptaget. Försök igen.' }, 409);
  }

  // ------------------------------------------------------------
  // Lista konton
  // ------------------------------------------------------------
  if (body.action === 'list') {
    const { data, error } = await admin
      .from('profiles')
      .select(
        'id, username, role, active, created_at, first_name, last_name, account_type, limited, must_change_password, features',
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      return json({ error: 'Kunde inte hämta konton. Försök igen.' }, 500);
    }
    return json({
      accounts: (data ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        role: p.role,
        active: p.active,
        createdAt: p.created_at,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        accountType: p.account_type ?? 'skola',
        limited: p.limited === true,
        mustChangePassword: p.must_change_password === true,
        features: Array.isArray(p.features)
          ? (p.features as unknown[]).map((value) => String(value))
          : [],
      })),
    });
  }

  // ------------------------------------------------------------
  // Översikt: verkliga räkningar direkt från databasen
  // ------------------------------------------------------------
  if (body.action === 'overview') {
    const countRows = (table: 'profiles' | 'registration_applications') =>
      admin.from(table).select('id', { count: 'exact', head: true });

    const [total, active, elev, larare, special, admins, limited, pending] =
      await Promise.all([
        countRows('profiles'),
        countRows('profiles').eq('active', true),
        countRows('profiles').eq('role', 'elev'),
        countRows('profiles').eq('role', 'lärare'),
        countRows('profiles').eq('role', 'speciallärare'),
        countRows('profiles').eq('role', 'admin'),
        countRows('profiles').eq('limited', true),
        countRows('registration_applications').eq('status', 'vantar'),
      ]);

    if (
      total.error || active.error || elev.error || larare.error ||
      special.error || admins.error || limited.error || pending.error
    ) {
      return json({ error: 'Kunde inte hämta översikten. Försök igen.' }, 500);
    }

    const totalCount = total.count ?? 0;
    const activeCount = active.count ?? 0;
    return json({
      counts: {
        accounts: totalCount,
        active: activeCount,
        inactive: totalCount - activeCount,
        students: elev.count ?? 0,
        teachers: larare.count ?? 0,
        specialTeachers: special.count ?? 0,
        admins: admins.count ?? 0,
        limited: limited.count ?? 0,
        pendingApplications: pending.count ?? 0,
      },
    });
  }

  // ------------------------------------------------------------
  // Aktivera / inaktivera konto
  // ------------------------------------------------------------
  if (body.action === 'set-active') {
    const userId = body.userId ?? '';
    const active = body.active === true;
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }

    // Säkerhetsregel: ingen kan inaktivera sitt eget konto, även om
    // gränssnittet redan blockerar det. callerData kommer från den
    // verifierade JWT:n ovan.
    if (!active && callerData?.user?.id === userId) {
      return json(
        { error: 'Du kan inte inaktivera ditt eget konto.' },
        403,
      );
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    // Sista aktiva administratören får inte stängas av — då låser systemet ute
    // sig självt utan någon som kan öppna det igen.
    if (!active && profile.role === 'admin') {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true);
      if ((count ?? 0) <= 1) {
        return json(
          { error: 'Det måste finnas minst en aktiv administratör.' },
          403,
        );
      }
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ active })
      .eq('id', userId);
    if (updateErr) {
      return json({ error: 'Kunde inte uppdatera kontot. Försök igen.' }, 500);
    }

    // Spegla statusen i app_metadata så att inloggningstjänsten och
    // sessioner ser samma status.
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const merged = {
        ...(userData?.user?.app_metadata ?? {}),
        username: profile.username,
        role: profile.role,
        active,
      };
      await admin.auth.admin.updateUserById(userId, { app_metadata: merged });
    } catch {
      /* profiles är auktoritativt för inloggning — fortsätt ändå */
    }

    return json({ ok: true });
  }

  // ------------------------------------------------------------
  // Uppdatera tillåtna profiluppgifter (förnamn och efternamn)
  // ------------------------------------------------------------
  // Rollen kan aldrig ändras här — den har sin egen, loggade åtgärd.
  if (body.action === 'update-profile') {
    const userId = body.userId ?? '';
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }

    const firstName = (body.firstName ?? '').trim().slice(0, 80);
    const lastName = (body.lastName ?? '').trim().slice(0, 80);
    if (firstName.length === 1 || lastName.length === 1) {
      return json({ error: 'Namnet är för kort.' }, 400);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ first_name: firstName || null, last_name: lastName || null })
      .eq('id', userId);
    if (updateErr) {
      return json({ error: 'Kunde inte spara uppgifterna. Försök igen.' }, 500);
    }

    // user_metadata speglar namnet så att det följer med i sessionen.
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const merged = {
        ...(userData?.user?.user_metadata ?? {}),
        first_name: firstName,
        last_name: lastName,
      };
      await admin.auth.admin.updateUserById(userId, { user_metadata: merged });
    } catch {
      /* profilen är auktoritativ — fortsätt ändå */
    }

    await admin.rpc('log_audit', {
      p_action: 'account.profile_updated',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: {},
    });

    return json({ ok: true });
  }

  // ------------------------------------------------------------
  // Nytt tillfälligt lösenord (visas en gång, kräver byte vid inloggning)
  // ------------------------------------------------------------
  if (body.action === 'reset-password') {
    const userId = body.userId ?? '';
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    const password = generateTempPassword();
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      password,
    });
    if (authErr) {
      return json({ error: 'Kunde inte återställa lösenordet. Försök igen.' }, 500);
    }

    // Användaren måste välja ett eget lösenord vid nästa inloggning.
    await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId);
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const merged = {
        ...(userData?.user?.app_metadata ?? {}),
        username: profile.username,
        role: profile.role,
        must_change_password: true,
      };
      await admin.auth.admin.updateUserById(userId, { app_metadata: merged });
    } catch {
      /* profilen styr spärren — fortsätt ändå */
    }

    await admin.rpc('log_audit', {
      p_action: 'account.password_reset',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: {},
    });

    // Lösenordet finns bara i det här svaret.
    return json({ ok: true, username: profile.username, initialPassword: password });
  }

  // ------------------------------------------------------------
  // Byt roll (endast admin, aldrig på sitt eget konto)
  // ------------------------------------------------------------
  if (body.action === 'set-role') {
    const userId = body.userId ?? '';
    const role = body.role ?? '';
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: 'Ogiltig roll.' }, 400);
    }
    // Ingen får ändra sin egen roll — då kan en admin råka låsa ute sig själv,
    // och självhöjning ska alltid kräva en annan administratör.
    if (callerData.user.id === userId) {
      return json({ error: 'Du kan inte ändra din egen roll.' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    // Sista administratören får inte nedgraderas — då finns ingen kvar som kan
    // hantera roller och konton.
    if (profile.role === 'admin' && role !== 'admin') {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true);
      if ((count ?? 0) <= 1) {
        return json(
          { error: 'Det måste finnas minst en aktiv administratör.' },
          403,
        );
      }
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', userId);
    if (updateErr) {
      return json({ error: 'Kunde inte uppdatera rollen. Försök igen.' }, 500);
    }

    // app_metadata får aldrig lämna kvar den gamla rollen — den läses av
    // inloggningen och av Row Level Security.
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const merged = {
        ...(userData?.user?.app_metadata ?? {}),
        username: profile.username,
        role,
      };
      await admin.auth.admin.updateUserById(userId, { app_metadata: merged });
    } catch {
      return json({ error: 'Rollen sparades men sessionen kunde inte uppdateras.' }, 500);
    }

    await admin.rpc('log_audit', {
      p_action: 'account.role_changed',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: { from: profile.role, to: role },
    });

    return json({ ok: true, role });
  }

  // ------------------------------------------------------------
  // Begränsa / häv begränsning (t.ex. efter granskning av en ansökan)
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // Kontotyp för elever: skolelev eller privat elev
  // ------------------------------------------------------------
  if (body.action === 'set-account-type') {
    const userId = body.userId ?? '';
    const accountType = body.accountType === 'privat' ? 'privat' : 'skola';
    if (!UUID_RE.test(userId)) return json({ error: 'Ogiltigt användar-ID.' }, 400);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role, account_type')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Kontot hittades inte.' }, 404);
    if (profile.role !== 'elev') {
      return json({ error: 'Kontotypen gäller bara elevkonton.' }, 400);
    }

    // Ett privat konto får inte vara med i en klass: medlemskapet ger
    // klasslista, klasschatt och kamrater. Kontrollera före ändringen så att
    // ingen data tas bort i tysthet.
    if (accountType === 'privat') {
      const { count } = await admin
        .from('class_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if ((count ?? 0) > 0) {
        return json(
          {
            error:
              'Eleven är med i en klass. Ta bort eleven från klassen först, annars finns klassåtkomsten kvar.',
          },
          409,
        );
      }
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ account_type: accountType })
      .eq('id', userId);
    if (updateErr) return json({ error: 'Kunde inte spara kontotypen.' }, 500);

    // Sessionen läser kontotypen från profilen vid inloggning, men metadata
    // hålls i synk så att inget gammalt värde ligger kvar i ett token.
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...(userData?.user?.app_metadata ?? {}),
          username: profile.username,
          role: profile.role,
          account_type: accountType,
        },
      });
    } catch {
      /* profilen styr behörigheten — fortsätt ändå */
    }

    await admin.rpc('log_audit', {
      p_action: 'account.account_type_changed',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: { from: profile.account_type ?? 'skola', to: accountType },
    });

    return json({ ok: true, accountType });
  }

  if (body.action === 'set-limited') {
    const userId = body.userId ?? '';
    const limited = body.limited === true;
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }
    if (callerData.user.id === userId) {
      return json({ error: 'Du kan inte begränsa ditt eget konto.' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ limited })
      .eq('id', userId);
    if (updateErr) {
      return json({ error: 'Kunde inte uppdatera kontot. Försök igen.' }, 500);
    }

    // app_metadata läses av sessionssvaret och måste spegla profilen.
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const merged = {
        ...(userData?.user?.app_metadata ?? {}),
        username: profile.username,
        role: profile.role,
        limited,
      };
      await admin.auth.admin.updateUserById(userId, { app_metadata: merged });
    } catch {
      /* profilen är auktoritativ — fortsätt ändå */
    }

    await admin.rpc('log_audit', {
      p_action: limited ? 'account.restricted' : 'account.unrestricted',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: { limited },
    });

    return json({ ok: true, limited });
  }

  // ------------------------------------------------------------
  // Radera konto (kräver att kontot inte är det sista aktiva admin-kontot)
  // ------------------------------------------------------------
  if (body.action === 'delete') {
    const userId = body.userId ?? '';
    if (!UUID_RE.test(userId)) {
      return json({ error: 'Ogiltigt användar-ID.' }, 400);
    }
    if (callerData.user.id === userId) {
      return json({ error: 'Du kan inte radera ditt eget konto.' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, role, active')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) {
      return json({ error: 'Kontot hittades inte.' }, 404);
    }

    // Sista aktiva administratören får aldrig raderas — då låser systemet ute
    // sig självt. Ett inaktivt adminkonto kan däremot tas bort, eftersom det
    // inte bidrar till den aktiva åtkomsten.
    if (profile.role === 'admin' && profile.active) {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true);
      if ((count ?? 0) <= 1) {
        return json(
          { error: 'Det måste finnas minst en aktiv administratör.' },
          403,
        );
      }
    }

    // Auth-kontot raderas först; profilen och övriga kopplingar följer med via
    // databasens foreign keys (cascade eller set null). Loggen skrivs först när
    // raderingen har lyckats, så ett misslyckat försök inte ser ut som ett
    // genomfört beslut.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return json(
        { error: 'Kontot kunde inte raderas. Försök igen.' },
        500,
      );
    }

    await admin.rpc('log_audit', {
      p_action: 'account.deleted',
      p_subject_type: 'user',
      p_subject_id: userId,
      p_details: { username: profile.username, role: profile.role },
    });

    return json({ ok: true, username: profile.username });
  }

  return json({ error: 'Okänd åtgärd.' }, 400);
});
