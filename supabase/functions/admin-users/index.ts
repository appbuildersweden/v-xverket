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

  // Rollen läses från JWT:ns app_metadata, som bara serversidan kan skriva.
  const callerRole = callerData.user.app_metadata?.role;
  if (callerRole !== 'admin') {
    return json({ error: 'Endast administratörer får göra detta.' }, 403);
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
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  // ------------------------------------------------------------
  // Skapa konto
  // ------------------------------------------------------------
  if (body.action === 'create') {
    const username = (body.username ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const role = body.role ?? '';

    if (!USERNAME_RE.test(username)) {
      return json(
        {
          error:
            'Användarnamnet är ogiltigt. Använd 3–32 tecken: små bokstäver, siffror, punkt, bindestreck eller understreck.',
        },
        400,
      );
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: 'Lösenordet måste vara minst 8 tecken.' }, 400);
    }
    if (!ROLES.includes(role)) {
      return json({ error: 'Ogiltig roll.' }, 400);
    }

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (existing) {
      return json({ error: 'Användarnamnet finns redan.' }, 409);
    }

    // Intern identifierare för Supabase Auth (e-postformat krävs av Auth).
    // Användaren loggar aldrig in med detta — bara användarnamn + lösenord.
    const email = `${username}@vaxverket.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ingen e-postverifiering krävs
      app_metadata: { username, role, active: true },
      user_metadata: { username },
    });
    if (createErr || !created?.user) {
      const msg = String(createErr?.message ?? '');
      if (/already|exists|duplicate/i.test(msg)) {
        return json({ error: 'Användarnamnet finns redan.' }, 409);
      }
      return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      id: created.user.id,
      username,
      role,
      active: true,
    });
    if (profileErr) {
      // Städa upp så inget halvskapat konto blir kvar.
      try {
        await admin.auth.admin.deleteUser(created.user.id);
      } catch {
        /* ignorera */
      }
      return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
    }

    // Lösenordet returneras eller sparas aldrig — admin delar det säkert med
    // användaren en gång.
    return json({ username, role }, 201);
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
