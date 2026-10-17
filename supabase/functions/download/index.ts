/**
 * Elda – skyddad nedladdning av appens installationsfil.
 *
 * Filerna ligger i den privata Storage-bucketen `elda-installers`. Bucketen har
 * ingen läs-policy, så en direktadress ger 403/404 för alla klienter. Den här
 * funktionen är den enda vägen: den verifierar sessionen, kontrollerar kontot
 * och utfärdar sedan en kortlivad signerad länk.
 *
 * Regler (samma som registreringsboten):
 *   * kontot måste finnas och vara aktivt
 *   * begränsade konton (väntar på granskning) får ingen länk
 *   * borttagna/inaktiverade konton får ingen länk
 *   * en länk lever i två minuter och ger ingen annan behörighet
 *
 * Deploy: supabase functions deploy download --no-verify-jwt
 * (JWT verifieras i funktionen.)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'elda-installers';
const URL_TTL_SECONDS = 120;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface Installer {
  name: string;
  version: number[];
}

function versionOf(name: string, pattern: RegExp): number[] | null {
  const match = pattern.exec(name);
  if (!match) return null;
  return match[1].split('.').map((part) => Number(part));
}

function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

function pick(list: { name: string }[], pattern: RegExp): Installer | null {
  let best: Installer | null = null;
  for (const item of list) {
    const version = versionOf(item.name, pattern);
    if (!version) continue;
    if (!best || isNewer(version, best.version)) best = { name: item.name, version };
  }
  return best;
}

const EXE_RE = /^Elda_(\d+\.\d+\.\d+)_x64-setup\.exe$/;
const MSI_RE = /^Elda_(\d+\.\d+\.\d+)_x64_en-US\.msi$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metod tillåts inte.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Servern är inte konfigurerad.' }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const format = String(body.format ?? 'exe') === 'msi' ? 'msi' : 'exe';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Publik information om senaste versionen — aldrig en länk. Sidan behöver
  // versionsnummer och filstorlek för att kunna visa rätt siffror innan någon
  // har loggat in.
  if (String(body.action ?? '') === 'info') {
    const { data: files, error: listErr } = await admin.storage.from(BUCKET).list('', {
      limit: 100,
    });
    if (listErr) return json({ error: 'Kunde inte läsa versionen just nu.' }, 503);

    const exe = pick(files ?? [], EXE_RE);
    const msi = pick(files ?? [], MSI_RE);
    const latest = exe ?? msi;
    if (!latest) return json({ ok: true, available: false });

    const meta = (files ?? []).find((file) => file.name === latest.name);
    return json({
      ok: true,
      available: true,
      version: latest.version.join('.'),
      fileName: latest.name,
      size: meta?.metadata?.size ?? null,
      updatedAt: meta?.updated_at ?? null,
      formats: { exe: Boolean(exe), msi: Boolean(msi) },
    });
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json(
      { error: 'Du behöver ett konto för att ladda ner Elda. Registrera dig först.' },
      401,
    );
  }

  // Sessionen verifieras mot Auth — en påhittad eller utgången token ger 401.
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return json(
      { error: 'Sessionen har gått ut. Logga in igen för att ladda ner.' },
      401,
    );
  }
  const userId = authData.user.id;

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, role, active, limited')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    return json({ error: 'Kunde inte kontrollera kontot. Försök igen.' }, 500);
  }
  if (!profile) {
    return json(
      { error: 'Kontot hittades inte. Det kan vara borttaget — registrera dig igen.' },
      403,
    );
  }
  if (profile.active !== true) {
    return json({ error: 'Kontot är inaktiverat. Kontakta administratören.' }, 403);
  }
  if (profile.limited === true) {
    return json(
      {
        error:
          'Kontot väntar på godkännande. Nedladdningen öppnas när en administratör har granskat ansökan.',
        pendingReview: true,
      },
      403,
    );
  }

  const { data: files, error: listErr } = await admin.storage.from(BUCKET).list('', {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (listErr) {
    return json({ error: 'Installationsfilen är inte tillgänglig just nu.' }, 503);
  }

  const installer = pick(files ?? [], format === 'msi' ? MSI_RE : EXE_RE);
  if (!installer) {
    return json({ error: 'Ingen installationsfil har publicerats ännu.' }, 404);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(installer.name, URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return json({ error: 'Kunde inte skapa en nedladdningslänk. Försök igen.' }, 500);
  }

  // Loggen sparar filnamn och användare — aldrig den signerade länken.
  await admin.from('download_grants').insert({ user_id: userId, file_name: installer.name });

  return json({
    ok: true,
    url: signed.signedUrl,
    fileName: installer.name,
    version: installer.version.join('.'),
    expiresIn: URL_TTL_SECONDS,
  });
});
