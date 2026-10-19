/**
 * Elda Skola – skapa ett elevkonto åt en klass (endast lärare).
 *
 * Läraren har redan sitt eget Elda-konto och sin roll. Den här funktionen låter
 * en lärare skapa ett skolelevskonto direkt i sin egen klass, med ett tillfälligt
 * lösenord som visas en gång. Anroparens roll kontrolleras här med service-nyckeln
 * mot profiles/app_metadata – en elev kan aldrig anropa funktionen och aldrig
 * skapa ett konto med en annan roll än 'elev'.
 *
 * Användarnamnet följer skolans befintliga regel (e + 3 + 2 + löpnummer) och
 * skapas av servern. Eleven måste byta lösenord vid första inloggningen, precis
 * som konton som skapas av en administratör.
 *
 * Deploy: supabase functions deploy school-account
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIN_PASSWORD_LENGTH = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

const SV: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y', ñ: 'n', ç: 'c', š: 's', ž: 'z', đ: 'd', ð: 'd', þ: 'p',
};

function letters(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => SV[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

/** Samma regel som admin-users: e + 3 + 2 bokstäver, sedan löpnummer. */
function usernameBase(first: unknown, last: unknown): string {
  let f = letters(first);
  let l = letters(last);
  if (!f && !l) f = 'elev';
  f = (f.slice(0, 3) + 'xxx').slice(0, 3);
  l = (l.slice(0, 2) + 'xx').slice(0, 2);
  return `e${f}${l}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metod tillåts inte.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Du behöver vara inloggad.' }, 401);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerErr } = await anon.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return json({ error: 'Sessionen har gått ut. Logga in igen.' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, active, limited')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (!profile) return json({ error: 'Profilen hittades inte.' }, 404);
  if (profile.active !== true) return json({ error: 'Kontot är inaktiverat.' }, 403);
  if (profile.role !== 'lärare' && profile.role !== 'admin') {
    return json({ error: 'Endast lärare får skapa elevkonton.' }, 403);
  }
  if (profile.limited === true) {
    return json({ error: 'Kontot är begränsat. Kontakta administratören.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const classId = String(body.classId ?? '').trim();
  const password = body.password ? String(body.password) : generateTempPassword();
  const generated = !body.password;

  if (!firstName) return json({ error: 'Ange elevens förnamn.' }, 400);
  if (firstName.length > 60 || lastName.length > 60) {
    return json({ error: 'Namnet är för långt.' }, 400);
  }
  if (!classId) return json({ error: 'Välj en klass.' }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.` }, 400);
  }

  // Klassen måste finnas och anroparen måste vara dess lärare. Kontrollen görs
  // med användarens egen token så att databasens åtkomstregler gäller.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: isTeacher } = await caller.rpc('is_class_teacher', { p_class: classId });
  if (isTeacher !== true) {
    return json({ error: 'Du är inte lärare för den klassen.' }, 403);
  }

  const base = usernameBase(firstName, lastName);
  const { data: taken } = await admin
    .from('profiles')
    .select('username')
    .like('username', `${base}%`);
  const used = new Set((taken ?? []).map((row) => String((row as { username: string }).username)));

  const candidates: string[] = [];
  for (let n = 1; n <= 99 && candidates.length < 99; n++) {
    const candidate = `${base}${String(n).padStart(2, '0')}`;
    if (!used.has(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) {
    return json({ error: 'Alla löpnummer för namnet är upptagna.' }, 409);
  }

  for (const username of candidates) {
    const email = `${username}@vaxverket.local`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        username,
        role: 'elev',
        active: true,
        must_change_password: true,
        account_type: 'skola',
      },
      user_metadata: { username, first_name: firstName, last_name: lastName },
    });

    if (createErr || !created?.user) {
      if (/already|exists|duplicate|registered/i.test(String(createErr?.message ?? ''))) continue;
      return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      id: created.user.id,
      username,
      role: 'elev',
      active: true,
      first_name: firstName,
      last_name: lastName,
      must_change_password: true,
      account_type: 'skola',
    });
    if (profileErr) {
      try {
        await admin.auth.admin.deleteUser(created.user.id);
      } catch {
        /* städning är bästa ansträngning */
      }
      if (/duplicate|unique/i.test(String(profileErr.message ?? ''))) continue;
      return json({ error: 'Kunde inte skapa kontot. Försök igen.' }, 500);
    }

    // Eleven läggs i lärarens klass med samma användare – inget andra konto.
    const { error: memberErr } = await admin.from('class_members').insert({
      class_id: classId,
      user_id: created.user.id,
      member_role: 'elev',
      added_by: profile.id,
    });
    if (memberErr) {
      // Kontot finns kvar; läraren kan lägga till det igen i klassen.
      return json(
        {
          error:
            'Kontot skapades men kunde inte läggas i klassen. Lägg till eleven via klasslistan.',
          username,
          initialPassword: generated ? password : null,
        },
        207,
      );
    }

    await admin.rpc('log_audit', {
      p_action: 'school.student.created',
      p_subject_type: 'user',
      p_subject_id: created.user.id,
      p_details: { username, class_id: classId, created_by: profile.id },
    });

    return json({
      ok: true,
      username,
      initialPassword: generated ? password : null,
      mustChangePassword: true,
    });
  }

  return json({ error: 'Användarnamnet är upptaget. Försök igen.' }, 409);
});
