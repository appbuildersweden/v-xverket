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
const ROLES = ['admin', 'speciallärare', 'elev'];
const MIN_PASSWORD_LENGTH = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tillfälligt lösenord för nya konton. Användaren måste byta det vid första
// inloggningen — flaggan must_change_password styr det, inte lösenordet.
const TEMP_PASSWORD = 'student123';

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

/** 'e' + 3 bokstäver av förnamnet + 2 av efternamnet (+ löpnummer senare). */
function usernameBase(first: unknown, last: unknown): string {
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
    // Endast det kända tillfälliga lösenordet används för nya konton. Skickas
    // ett eget lösenord med måste det vara starkt nog.
    const password = body.password ? body.password : TEMP_PASSWORD;
    // Explicit namn används bara när den administrativa vägen reserverar ett
    // bestämt namn (t.ex. ejentu01). Annars genereras namnet alltid.
    const explicit = (body.username ?? '').trim().toLowerCase();

    if (!ROLES.includes(role)) {
      return json({ error: 'Ogiltig roll.' }, 400);
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

      // Lösenordet returneras eller sparas aldrig i klartext.
      return json(
        { username, role, mustChangePassword: mustChange },
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
      .select('id, username, role, active, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
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
      })),
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

  return json({ error: 'Okänd åtgärd.' }, 400);
});
