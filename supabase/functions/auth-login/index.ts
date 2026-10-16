// Växverket — auth-login
// Skyddad inloggningsfunktion: kopplar användarnamn till rätt
// autentiseringsidentifierare och låter Supabase Auth verifiera lösenordet.
// Ingen klient kan själv bestämma användarnamn/roll här.
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

  let body: { username?: string; password?: string };
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
    .select('id, active, must_change_password')
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
  const session = await grant.json();
  if (!session?.access_token || !session?.refresh_token) {
    return json(generic, 401);
  }

  // 4. Inaktiverade konton får ingen session (kontrolleras först efter
  //    lyckad lösenordsverifiering för att inte avslöja om namnet finns).
  if (!profile.active) {
    return json({ error: 'Kontot är inaktiverat. Kontakta administratören.' }, 403);
  }

  // Rollen hämtas från app_metadata — sätts endast av administratörs-
  // funktionen och kan inte ändras av klienten.
  const role = userData.user.app_metadata?.role ?? 'elev';
  // Tvingat lösenordsbyte: nya konton får ett tillfälligt lösenord och måste
  // välja ett eget innan appen släpper in dem i panelerna. Flaggan kommer från
  // profiles (auktoritativ) och speglas i sessionssvaret.
  const mustChangePassword =
    profile.must_change_password === true ||
    userData.user.app_metadata?.must_change_password === true;

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user: {
      id: userData.user.id,
      username,
      role,
      mustChangePassword,
    },
  });
});
