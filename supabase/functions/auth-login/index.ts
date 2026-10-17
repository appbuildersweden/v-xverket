// Växverket — auth-login
// Skyddad inloggningsfunktion: kopplar användarnamn till rätt
// autentiseringsidentifierare och låter Supabase Auth verifiera lösenordet.
// Ingen klient kan själv bestämma användarnamn/roll här.
//
// Tvingat lösenordsbyte hävdas här, inte i gränssnittet: ett konto som
// fortfarande har sitt tillfälliga lösenord (must_change_password) får ingen
// session förrän det nya lösenordet följer med i samma anrop och har sparats.
// Därmed finns ingen token som kan användas för att gå förbi steget.
//
// Deploy:  supabase functions deploy auth-login --no-verify-jwt
// (funktionen skyddas av rate limit generella felmeddelanden)

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

// Regler för användarens eget lösenord. De speglar klientens kontroll i
// src-new/src/lib/password.ts, men servern är auktoritativ: klientens kontroll
// är bara en hjälp och kan kringgås.
const MIN_PASSWORD_LENGTH = 8;
const FORBIDDEN_PASSWORDS = ['student123', 'losenord', 'password'];

function validateNewPassword(
  password: string,
  username: string,
  temporary: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
  }
  if (password.toLowerCase() === username) {
    return 'Lösenordet får inte vara samma som ditt användarnamn.';
  }
  if (FORBIDDEN_PASSWORDS.includes(password.toLowerCase())) {
    return 'Det lösenordet är för vanligt. Välj ett eget.';
  }
  if (password === temporary) {
    return 'Välj ett annat lösenord än det tillfälliga.';
  }
  return null;
}

// Enkel rate limit per IP (bästa skydd per instans — missbruksskydd).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; reset: number }>();

function allowAttempt(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.reset) {
    attempts.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Metod tillåts inte.' }, 405);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'okand';
  if (!allowAttempt(ip)) {
    return json(
      { error: 'För många försök. Vänta en stund och försök igen.' },
      429,
    );
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  let body: { username?: string; password?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const username = (body.username ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  // Samma generella fel oavsett om användarnamnet finns — motverkar kartläggning.
  const generic = { error: 'Fel användarnamn eller lösenord.' };
  if (!USERNAME_RE.test(username) || !password) {
    return json(generic, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Användarnamn → profil (username är unikt).
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, active, must_change_password, account_type, limited, features, role')
    .eq('username', username)
    .maybeSingle();
  if (profileErr) {
    return json({ error: 'Servern kunde inte slutföra inloggningen.' }, 500);
  }
  if (!profile) {
    return json(generic, 401);
  }

  // 2. Hämta autentiseringskontot (e-postidentifieraren).
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
    profile.id,
  );
  if (userErr || !userData?.user?.email) {
    return json(generic, 401);
  }

  // 3. Lösenordsverifiering sköts av Supabase Auth (krypterat/saltat
  //    server-side — inga lösenord lagras eller hanteras i klartext här).
  const grant = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: userData.user.email, password }),
    },
  );
  if (!grant.ok) {
    return json(generic, 401);
  }
  let session = await grant.json();
  if (!session?.access_token || !session?.refresh_token) {
    return json(generic, 401);
  }

  // 4. Inaktiverade konton får ingen session (kontrolleras först efter
  //    lyckad lösenordsverifiering för att inte avslöja om namnet finns).
  if (!profile.active) {
    return json({ error: 'Kontot är inaktiverat. Kontakta administratören.' }, 403);
  }

  // Rollen hämtas från profilen (auktoritativ) med app_metadata som reserv.
  // Båda sätts endast av serverfunktionerna och kan inte ändras av klienten.
  const role = String(profile.role ?? userData.user.app_metadata?.role ?? 'elev');
  // Tvingat lösenordsbyte: nya konton får ett tillfälligt lösenord och måste
  // välja ett eget innan appen släpper in dem i panelerna. Flaggan kommer från
  // profiles (auktoritativ) och speglas i sessionssvaret.
  let mustChangePassword =
    profile.must_change_password === true ||
    userData.user.app_metadata?.must_change_password === true;

  // Spärren ligger här, inte i klienten. Lösenordet har redan verifierats ovan,
  // så bara kontots ägare kan byta det. Utan ett nytt lösenord i samma anrop
  // lämnas ingen session ut — det tillfälliga lösenordet ger alltså inget
  // tillträde till API:et.
  if (mustChangePassword) {
    const newPassword = body.newPassword ?? '';
    if (!newPassword) {
      return json(
        {
          error:
            'Ditt konto har ett tillfälligt lösenord. Välj ett eget för att fortsätta.',
          mustChangePassword: true,
        },
        409,
      );
    }

    const problem = validateNewPassword(newPassword, username, password);
    if (problem) {
      return json({ error: problem, mustChangePassword: true }, 400);
    }

    const { error: saveErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    if (saveErr) {
      return json({ error: 'Kunde inte spara det nya lösenordet. Försök igen.' }, 500);
    }

    // Spärren nollas i profilen (auktoritativ) och i app_metadata, som läses av
    // sessionssvaret och av de andra serverfunktionerna.
    await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', profile.id);
    try {
      const merged = {
        ...(userData.user.app_metadata ?? {}),
        must_change_password: false,
      };
      await admin.auth.admin.updateUserById(profile.id, { app_metadata: merged });
    } catch {
      /* profilen styr spärren — fortsätt ändå */
    }

    // Sessionen som det tillfälliga lösenordet gav ska inte leva vidare. Att
    // byta lösenord kan redan ha stängt den; då är svaret ett fel här, vilket vi
    // loggar i stället för att tiga om det.
    try {
      const revoked = await admin.auth.admin.signOut(session.access_token, 'global');
      if (revoked.error) {
        console.warn(
          'auth-login: kunde inte stänga sessionen från det tillfälliga lösenordet:',
          revoked.error.message,
        );
      }
    } catch (err) {
      console.warn(
        'auth-login: kunde inte stänga sessionen från det tillfälliga lösenordet:',
        err instanceof Error ? err.message : String(err),
      );
    }

    // Ny session, den här gången med användarens eget lösenord.
    const regrant = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userData.user.email, password: newPassword }),
      },
    );
    if (!regrant.ok) {
      return json(
        { error: 'Lösenordet sparades, men inloggningen kunde inte slutföras. Logga in igen.' },
        500,
      );
    }
    const fresh = await regrant.json();
    if (!fresh?.access_token || !fresh?.refresh_token) {
      return json(
        { error: 'Lösenordet sparades, men inloggningen kunde inte slutföras. Logga in igen.' },
        500,
      );
    }
    session = fresh;
    mustChangePassword = false;
  }

  // Kontotypen kommer från profiles (auktoritativ) och avgör vilka
  // klassfunktioner eleven erbjuds. Ett begränsat konto (limited) får läsa men
  // inte skapa klasser eller ansöka om klassmedlemskap.
  const accountType = profile.account_type === 'privat' ? 'privat' : 'skola';
  const limited = profile.limited === true;
  // Funktionsvalen styr lärarpanelen och läses härifrån vid varje inloggning,
  // så att ett ändrat val slår igenom på alla enheter.
  const features = Array.isArray(profile.features)
    ? (profile.features as unknown[]).map((value) => String(value))
    : [];

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user: {
      id: userData.user.id,
      username,
      role,
      mustChangePassword,
      accountType,
      limited,
      features,
    },
  });
});
