/**
 * Elda – kontoärenden som kräver serverbehörighet.
 *
 * Två åtgärder, båda med egna skyddsregler:
 *
 *   update-features  Inloggad lärare/speciallärare ändrar sina funktionsval.
 *                    Rollen och de tillåtna värdena kontrolleras här, aldrig i
 *                    klienten, och valen skrivs både på profilen (auktoritativ)
 *                    och i app_metadata (följer med i sessionen).
 *
 *   delete           Borttagning av det egna kontot med spårningskoden från
 *                    registreringen. Koden ensam räcker aldrig: lösenordet
 *                    verifieras av Supabase Auth för samma konto. Borttagningen
 *                    är idempotent och lämnar ett spår utan personuppgifter.
 *
 * Deploy: supabase functions deploy account --no-verify-jwt
 * (JWT verifieras i funktionen; delete-flödet är avsiktligt utan session.)
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { sanitizeFeatures } from '../_shared/features.ts';

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

// Missbruksskydd per IP och åtgärd. Borttagning är den känsligaste åtgärden och
// har därför en snål budget: en spårningskod ska inte gå att gissa sig till.
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS: Record<string, number> = {
  'update-features': 30,
  delete: 10,
};
const hits = new Map<string, { count: number; reset: number }>();

function allow(key: string, action: string): boolean {
  const max = LIMITS[action] ?? 20;
  const now = Date.now();
  const id = `${key}:${action}`;
  const entry = hits.get(id);
  if (!entry || now > entry.reset) {
    hits.set(id, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

async function audit(
  admin: SupabaseClient,
  action: string,
  subjectType: string,
  subjectId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await admin.from('audit_log').insert({
    actor_id: null,
    actor_role: 'registreringsbot',
    action,
    subject_type: subjectType,
    subject_id: subjectId,
    details,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metod tillåts inte.' }, 405);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'okand';

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const action = String(body.action ?? '');
  if (!LIMITS[action]) return json({ error: 'Okänd åtgärd.' }, 400);
  if (!allow(ip, action)) {
    return json({ error: 'För många försök. Vänta en stund och försök igen.' }, 429);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ------------------------------------------------------- funktionsval
  if (action === 'update-features') {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Du behöver vara inloggad.' }, 401);

    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return json({ error: 'Sessionen har gått ut. Logga in igen.' }, 401);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, active')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (!profile) return json({ error: 'Profilen hittades inte.' }, 404);
    if (profile.active !== true) {
      return json({ error: 'Kontot är inaktiverat. Kontakta administratören.' }, 403);
    }

    // Endast personal har funktionsval. En elev kan aldrig skaffa sig en
    // lärarfunktion genom att anropa den här åtgärden.
    if (profile.role !== 'lärare' && profile.role !== 'speciallärare') {
      return json({ error: 'Funktionsval finns bara för lärare och speciallärare.' }, 403);
    }

    const features = sanitizeFeatures(body.features);

    const { error: profileErr } = await admin
      .from('profiles')
      .update({ features })
      .eq('id', profile.id);
    if (profileErr) {
      return json({ error: 'Kunde inte spara valen. Försök igen.' }, 500);
    }

    // app_metadata läses av appen vid inloggning och kan bara skrivas härifrån.
    try {
      await admin.auth.admin.updateUserById(profile.id, {
        app_metadata: {
          ...(authData.user.app_metadata ?? {}),
          features,
        },
      });
    } catch {
      /* profilen är auktoritativ — appen läser om vid nästa inloggning */
    }

    await audit(admin, 'profile.features_updated', 'user', profile.id, { features });
    return json({ ok: true, features });
  }

  // ------------------------------------------------------ kontoborttagning
  const trackingCode = String(body.trackingCode ?? '').trim().slice(0, 80);
  const password = String(body.password ?? '');
  const confirm = body.confirm === true;

  if (!trackingCode) {
    return json({ error: 'Ange spårningskoden från din registrering.' }, 400);
  }
  if (!confirm) {
    return json(
      { error: 'Bekräfta att kontot ska tas bort. Åtgärden kan inte ångras.' },
      400,
    );
  }
  if (!password) {
    return json({ error: 'Ange kontots lösenord för att bekräfta att det är ditt.' }, 400);
  }
  if (!allow(trackingCode, 'delete')) {
    return json({ error: 'För många försök för den här koden. Vänta en stund.' }, 429);
  }

  const { data: found } = await admin
    .from('registration_applications')
    .select('id, status, created_user_id, created_username')
    .eq('tracking_code', trackingCode)
    .maybeSingle();

  // Samma svar oavsett om koden finns: koden ska inte gå att kartlägga.
  if (!found) {
    return json({ error: 'Spårningskoden hittades inte.' }, 404);
  }

  const row = found as Record<string, unknown>;
  const applicationId = String(row.id);

  // Redan borttagen: samma svar igen, utan att något görs om. Det gör ett
  // omförsök efter ett nätverksfel ofarligt.
  if (row.status === 'borttagen') {
    return json({ ok: true, deleted: true, alreadyDeleted: true });
  }

  const userId = row.created_user_id ? String(row.created_user_id) : '';
  if (!userId) {
    return json(
      { error: 'Det finns inget konto kopplat till den här koden.' },
      409,
    );
  }

  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !authUser?.user?.email) {
    // Kontot är redan borta (t.ex. borttaget av admin). Markera ansökan och svara
    // som en lyckad, idempotent borttagning.
    await admin
      .from('registration_applications')
      .update({
        status: 'borttagen',
        deleted_at: new Date().toISOString(),
        created_username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);
    try {
      await admin
        .from('account_deletions')
        .insert({ application_id: applicationId, deleted_user_id: userId });
    } catch {
      /* redan registrerad */
    }
    return json({ ok: true, deleted: true, alreadyDeleted: true });
  }

  // Administratörskonton får aldrig raderas genom den publika processen.
  const role = String(authUser.user.app_metadata?.role ?? '');
  if (role === 'admin') {
    return json(
      { error: 'Administratörskonton kan inte tas bort här. Kontakta supporten.' },
      403,
    );
  }

  // Ägarskapet verifieras med lösenordet. Spårningskoden pekar ut kontot, men
  // bara den som kan kontots lösenord får radera det.
  const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authUser.user.email, password }),
  });
  if (!grant.ok) {
    return json(
      { error: 'Lösenordet stämmer inte. Kontot är inte borttaget.' },
      401,
    );
  }

  // Klasser som kontot äger tas bort först, annars blir de kvar utan lärare.
  try {
    await admin.from('classes').delete().eq('created_by', userId);
  } catch {
    /* klasserna kan redan vara borta */
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    const message = String(deleteErr.message ?? '');
    if (!/not found|does not exist/i.test(message)) {
      return json(
        { error: 'Kontot kunde inte tas bort just nu. Försök igen om en stund.' },
        500,
      );
    }
  }

  // Personuppgifterna i ansökan tas bort; kvar är spårningskoden och statusen,
  // som behövs för att en upprepad begäran ska få samma svar.
  await admin
    .from('registration_applications')
    .update({
      status: 'borttagen',
      payload: { answers: {}, skipped: [] },
      summary: null,
      full_name: null,
      email: null,
      created_username: null,
      risk_flags: [],
      review_note: null,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  try {
    await admin
      .from('account_deletions')
      .insert({ application_id: applicationId, deleted_user_id: userId });
  } catch {
    /* redan registrerad */
  }

  await audit(admin, 'account.deleted', 'application', applicationId, {
    role,
    via: 'tracking-code',
  });

  return json({ ok: true, deleted: true, alreadyDeleted: false });
});
