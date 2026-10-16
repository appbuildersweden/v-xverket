#!/usr/bin/env node
/**
 * Skapar (eller reparerar) administratörskontot `ejentu01` på ett säkert sätt.
 *
 * Skriptet körs av ägaren en gång, lokalt, med service role-nyckeln i miljön.
 * Nyckeln lämnar aldrig maskinen och skrivs aldrig ut. Lösenordet är det
 * överenskomna tillfälliga lösenordet och användaren måste byta det vid första
 * inloggningen — kontot får flaggan must_change_password.
 *
 * Körning (PowerShell):
 *   $env:SUPABASE_URL = "https://<projekt>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role-nyckel>"
 *   node scripts/skapa-admin.mjs
 *
 * Skriptet är idempotent: finns kontot redan ändras inget förutom att rollen
 * säkras som admin. Inga dubbletter skapas.
 */
import { createClient } from '@supabase/supabase-js';

const USERNAME = 'ejentu01';
const EMAIL = `${USERNAME}@vaxverket.local`;
const TEMP_PASSWORD = process.env.ELDA_TEMP_PASSWORD || 'student123';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

if (!url || !key) {
  console.error(
    'Saknar SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön. ' +
      'Sätt dem i terminalen (inte i någon fil i repot) och kör igen.',
  );
  process.exitCode = 1;
} else {
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /** Hitta kontot via profilen (användarnamnet är unikt). */
  async function findProfile() {
    const { data, error } = await admin
      .from('profiles')
      .select('id, username, role, must_change_password')
      .eq('username', USERNAME)
      .maybeSingle();
    if (error) throw new Error(`kunde inte läsa profiler: ${error.message}`);
    return data;
  }

  async function ensure() {
    let profile = await findProfile();
    let userId = profile?.id ?? null;
    let createdNow = false;

    if (!userId) {
      // Kanske finns ett auth-konto med samma interna e-post men utan profil.
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) throw new Error(`kunde inte lista användare: ${listErr.message}`);
      const existing = list?.users?.find((u) => u.email === EMAIL);

      if (existing) {
        userId = existing.id;
        console.log('Hittade befintligt auth-konto — återanvänder det.');
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: EMAIL,
          password: TEMP_PASSWORD,
          email_confirm: true,
          app_metadata: {
            username: USERNAME,
            role: 'admin',
            active: true,
            must_change_password: true,
          },
          user_metadata: { username: USERNAME },
        });
        if (createErr || !created?.user) {
          throw new Error(`kunde inte skapa kontot: ${createErr?.message ?? 'okänt fel'}`);
        }
        userId = created.user.id;
        createdNow = true;
        console.log('Skapade auth-kontot.');
      }

      const { error: insertErr } = await admin.from('profiles').insert({
        id: userId,
        username: USERNAME,
        role: 'admin',
        active: true,
        first_name: 'Jens',
        last_name: 'Turesson',
        must_change_password: true,
      });
      if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
        throw new Error(`kunde inte skapa profilen: ${insertErr.message}`);
      }
      profile = { id: userId, username: USERNAME, role: 'admin', must_change_password: true };
    }

    // Rollen ska alltid vara admin — sätts serversidigt i app_metadata, som
    // klienten aldrig kan skriva.
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const merged = {
      ...(userData?.user?.app_metadata ?? {}),
      username: USERNAME,
      role: 'admin',
      active: true,
      must_change_password: profile?.must_change_password !== false,
    };
    await admin.auth.admin.updateUserById(userId, { app_metadata: merged });

    const { error: profileUpdateErr } = await admin
      .from('profiles')
      .update({ role: 'admin', active: true })
      .eq('id', userId);
    if (profileUpdateErr) {
      throw new Error(`kunde inte säkra rollen: ${profileUpdateErr.message}`);
    }

    console.log('');
    console.log('Klart.');
    console.log(`  användarnamn : ${USERNAME}`);
    console.log(`  roll         : admin`);
    console.log(`  lösenord     : det tillfälliga lösenordet (måste bytas vid inloggning)`);
    if (createdNow) console.log('  status       : kontot skapades nu');
    else console.log('  status       : kontot fanns redan — rollen säkrades, inget dubblettkonto skapades');
  }

  ensure().catch((err) => {
    console.error(`Fel: ${err.message}`);
    process.exitCode = 1;
  });
}
