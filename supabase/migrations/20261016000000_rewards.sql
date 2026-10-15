-- Växverket steg 4: speciallärarens planering, XP, nivåer och belöningar.
--
-- All XP-utbetalning och upplåsning sker i security definer-funktioner nedan.
-- Klienten kan läsa sin egen data men kan inte skriva XP eller upplåsningar,
-- så en användare kan aldrig ge sig själv bonus-XP eller låsa upp belöningar.

-- ----------------------------------------------------------------
-- Hjälpare
-- ----------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ----------------------------------------------------------------
-- Inställningar (konfigurerbara XP-gränser)
-- ----------------------------------------------------------------

create table if not exists public.reward_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.reward_settings (key, value) values
  ('xp_per_task', '10'::jsonb),      -- XP per normalt slutförd uppgift
  ('xp_per_level', '100'::jsonb)     -- XP per nivå (nivå = floor(xp/per)+1)
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- Planeringsuppgifter (speciallärarens egna)
-- ----------------------------------------------------------------

create table if not exists public.spec_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  notes text,
  due_date date,
  priority text not null default 'medel'
    check (priority in ('lag', 'medel', 'hog')),
  status text not null default 'ej_paborjad'
    check (status in ('ej_paborjad', 'pagar', 'klar')),
  category text not null default 'arbetsomrade',
  completed_at timestamptz,
  -- Säkrar att en uppgift bara kan ge XP en gång, även vid samtidiga anrop.
  xp_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spec_tasks_user_idx
  on public.spec_tasks (user_id, status, due_date);

-- ----------------------------------------------------------------
-- XP-transaktioner (oföränderlig historik)
-- ----------------------------------------------------------------

create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount >= 0),
  source text not null
    check (source in ('task', 'reward_bonus', 'admin_adjustment')),
  task_id uuid references public.spec_tasks (id) on delete set null,
  reward_id uuid,
  note text,
  created_at timestamptz not null default now()
);

-- En uppgift ger XP bara en gång (atomisk garanti utöver xp_awarded-flaggan).
create unique index if not exists xp_tx_one_per_task
  on public.xp_transactions (user_id, task_id)
  where task_id is not null;

-- En belöningsbonus betalas bara en gång per användare och belöning.
create unique index if not exists xp_tx_one_per_reward
  on public.xp_transactions (user_id, reward_id)
  where reward_id is not null;

create index if not exists xp_tx_user_idx
  on public.xp_transactions (user_id, created_at);

-- ----------------------------------------------------------------
-- Ackumulerad XP per användare (hålls i sync av funktioner)
-- ----------------------------------------------------------------

create table if not exists public.user_xp (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- Belöningsdefinitioner (serverkontrollerad progression)
-- ----------------------------------------------------------------

create table if not exists public.reward_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  theme text not null default 'it'
    check (theme in ('it', 'halloween', 'special', 'jul')),
  position integer not null,
  xp_required integer not null check (xp_required >= 0),
  bonus_xp integer not null default 0 check (bonus_xp >= 0),
  illustration text,               -- emoji eller referens till föremål
  unlocks_items text[] not null default '{}',
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique (position)
);

-- ----------------------------------------------------------------
-- Upplåsta belöningar och dekorationsföremål
-- ----------------------------------------------------------------

create table if not exists public.reward_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_id uuid not null references public.reward_definitions (id) on delete cascade,
  bonus_xp_awarded integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, reward_id)      -- en belöning låses upp en gång
);

create table if not exists public.unlocked_decorations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_id uuid not null references public.reward_definitions (id) on delete cascade,
  item_key text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, reward_id, item_key)
);

-- ----------------------------------------------------------------
-- Nivåer och beräkningar
-- ----------------------------------------------------------------

create or replace function public.get_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.reward_settings where key = p_key;
$$;

create or replace function public.total_xp(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select total_xp from public.user_xp where user_id = p_user), 0);
$$;

-- Konsekvent nivåregel: nivå = floor(xp / xp_per_level) + 1.
-- xp_per_level ligger i reward_settings och kan ändras utan att systemet byggs om.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select floor(p_xp / coalesce(nullif((public.get_setting('xp_per_level') ->> '0')::int, 0), 100))::int + 1;
$$;

create or replace function public.refresh_user_xp(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_xp (user_id, total_xp, updated_at)
  select p_user, coalesce(sum(amount), 0), now()
  from public.xp_transactions where user_id = p_user
  on conflict (user_id) do update
    set total_xp = excluded.total_xp, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------
-- Belöningsupplåsning (atomisk, kan kallas om och om igen säkert)
-- ----------------------------------------------------------------

create or replace function public.check_reward_unlocks(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_rec record;
  v_unlocked jsonb := '[]'::jsonb;
  v_new boolean := false;
  v_bonus integer;
begin
  v_total := public.total_xp(p_user);

  for v_rec in
    select rd.*
    from public.reward_definitions rd
    where rd.xp_required <= v_total
      and not exists (
        select 1 from public.reward_unlocks ru
        where ru.user_id = p_user and ru.reward_id = rd.id
      )
      -- Den sista belöningen kräver att alla tidigare steg är avklarade.
      and (
        not rd.is_final
        or not exists (
          select 1 from public.reward_definitions prev
          where prev.position < rd.position
            and not exists (
              select 1 from public.reward_unlocks ru2
              where ru2.user_id = p_user and ru2.reward_id = prev.id
            )
        )
      )
    order by rd.position
  loop
    v_new := true;
    v_bonus := 0;

    insert into public.reward_unlocks (user_id, reward_id)
    values (p_user, v_rec.id);

    -- Bonus-XP betalas bara vid själva upplåsningen (unique-index skyddar
    -- mot dubbeltag även om funktionen körs om).
    if v_rec.bonus_xp > 0 then
      insert into public.xp_transactions (user_id, amount, source, reward_id, note)
      values (p_user, v_rec.bonus_xp, 'reward_bonus', v_rec.id, v_rec.name)
      on conflict do nothing;
      if found then
        v_bonus := v_rec.bonus_xp;
        perform public.refresh_user_xp(p_user);
        v_total := public.total_xp(p_user);
      end if;
    end if;

    insert into public.unlocked_decorations (user_id, reward_id, item_key)
    select p_user, v_rec.id, item
    from unnest(v_rec.unlocks_items) as item
    on conflict do nothing;

    v_unlocked := v_unlocked || jsonb_build_object(
      'id', v_rec.id,
      'name', v_rec.name,
      'description', v_rec.description,
      'theme', v_rec.theme,
      'illustration', v_rec.illustration,
      'bonus_xp', v_bonus,
      'items', to_jsonb(v_rec.unlocks_items)
    );
  end loop;

  -- En bonus (t.ex. Jens' 1000 XP) kan själv kvalificera till nya belöningar.
  if v_new then
    v_unlocked := v_unlocked || public.check_reward_unlocks(p_user);
  end if;

  return v_unlocked;
end;
$$;

-- ----------------------------------------------------------------
-- Slutför uppgift — hela flödet atomiskt
-- ----------------------------------------------------------------

create or replace function public.complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.spec_tasks%rowtype;
  v_xp integer := 0;
  v_per integer;
  v_unlocks jsonb;
  v_total integer;
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;

  -- For update + radlåsning gör att två samtidiga anrop inte kan ge dubbel XP.
  select * into v_task
  from public.spec_tasks
  where id = p_task_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Uppgiften hittades inte.';
  end if;

  update public.spec_tasks
  set status = 'klar',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_task_id;

  if not v_task.xp_awarded then
    v_per := coalesce(nullif((public.get_setting('xp_per_task') ->> '0')::int, 0), 10);
    insert into public.xp_transactions (user_id, amount, source, task_id, note)
    values (v_user, v_per, 'task', p_task_id, v_task.title)
    on conflict do nothing;
    if found then
      v_xp := v_per;
      update public.spec_tasks set xp_awarded = true where id = p_task_id;
    end if;
  end if;

  perform public.refresh_user_xp(v_user);
  v_unlocks := public.check_reward_unlocks(v_user);
  v_total := public.total_xp(v_user);

  return jsonb_build_object(
    'xp_awarded', v_xp,
    'total_xp', v_total,
    'level', public.level_for_xp(v_total),
    'unlocks', coalesce(v_unlocks, '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------
-- Återuppta uppgift (tar inte tillbaka redan utbetald XP)
-- ----------------------------------------------------------------

create or replace function public.reopen_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Ej inloggad.';
  end if;
  update public.spec_tasks
  set status = 'ej_paborjad', completed_at = null, updated_at = now()
  where id = p_task_id and user_id = v_user
    and xp_awarded = false;  -- redan betald XP återbetalas inte
end;
$$;

-- ----------------------------------------------------------------
-- Seed: belöningsbiblioteket
-- ----------------------------------------------------------------

insert into public.reward_definitions
  (name, description, theme, position, xp_required, bonus_xp, illustration, unlocks_items, is_final)
values
  -- IT-tekniker och uppskattning
  ('IT-hjälten', 'Du har räddat en dator. Helt enkelt.', 'it', 1, 10, 0, '🦸', '{dator}', false),
  ('Kabelräddaren', 'Kabelrulle med guldstjärna — du redde ut sladden.', 'it', 2, 25, 0, '🔌', '{kabelrulle}', false),
  ('Ctrl + Alt + Magiker', 'Trollstav med datorsymboler. Du trollar bort buggar.', 'it', 3, 45, 0, '🪄', '{trollstav}', false),
  ('Buggbekämpare', 'En gullig insekt med ett kryss. Buggar är rädda för dig.', 'it', 4, 70, 0, '🐞', '{kryss}', false),
  ('Teknikens drottning', 'Krona med små datorikoner. Du styr hela nätverket.', 'it', 5, 100, 0, '👑', '{krona}', false),
  ('Du fixar det!', 'Hjärta och stjärna. Det är bara att du fixar det.', 'it', 6, 135, 0, '💖', '{hjarta}', false),
  ('Superhjälten på IT', 'Mantel och laptop. Du räddar lektionstiden.', 'it', 7, 175, 0, '🦸‍♀️', '{mantel}', false),
  ('Världens bästa problemlösare', 'Diplom och gullig pokal.', 'it', 8, 220, 0, '📜', '{diplom}', false),
  ('Nätverksmästaren', 'Router och antenner böjer sig i beundran.', 'it', 9, 275, 0, '📡', '{antenn}', false),
  ('Servernas väktare', 'Servern surrar tryggt. Du håller vakt.', 'it', 10, 335, 0, '🖥️', '{server}', false),

  -- Halloween (mitten)
  ('Glad pumpa', 'En leende jack-o-lantern med varmt ljus.', 'halloween', 11, 400, 0, '🎃', '{pumpa}', false),
  ('Svävande spöke', 'Ett gulligt spöke som vinkar snällt.', 'halloween', 12, 470, 0, '👻', '{spoke}', false),
  ('Liten häxa med kvast', 'Hon flyger lågt och hälsar hej.', 'halloween', 13, 545, 0, '🧙‍♀️', '{kvast}', false),
  ('Svart katt med häxhatt', 'Mjau. Hatten är lite för stor.', 'halloween', 14, 625, 0, '🐈‍⬛', '{katt}', false),
  ('Magiskt häxhus', 'Ett snedställt hus med glödande fönster.', 'halloween', 15, 710, 0, '🏚️', '{hxhus}', false),
  ('Kitteln med färgglad dryck', 'Bobbob. Den bobbar.', 'halloween', 16, 800, 0, '🧪', '{kittel}', false),
  ('Fladdermöss & lysande pumpor', 'En svärm som lyser upp kvällen.', 'halloween', 17, 895, 0, '🦇', '{fladdermus}', false),
  ('Spöklig dator med lila sken', 'Den startar av sig själv. Eller?', 'halloween', 18, 995, 0, '💻', '{spokdator}', false),
  ('Halloweenpaketet', 'Ett paket med flera Halloweenföremål.', 'halloween', 19, 1100, 0, '📦', '{pumpa,spoke,katt}', false),

  -- Mot slutet
  ('Stjärnryttaren', 'Du riddar genom stjärnbilden.', 'special', 20, 1250, 0, '🌟', '{stjarna}', false),
  ('Mästarens pokal', 'Guld och glitter för en riktig mästare.', 'special', 21, 1400, 0, '🏆', '{pokal}', false),
  ('Jens Turesson är bäst', 'Officiellt bevisat. Belönar med 1 000 bonus-XP.', 'special', 22, 1600, 1000, '🥇', '{mstarpris,diplom,konfetti}', false),

  -- Allra sist
  ('Den magiska julfinalen', 'Ett stort julpaket som låser upp hela julen.', 'jul', 23, 1700, 0, '🎁', '{tomte,snogubbe,pepparkakshus,julgran,julklapp,ren,slade,nisse,julkrans,snoflinga,julykta,julstuga,julkatt,julhjarta}', true)
on conflict (name) do nothing;

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------

alter table public.spec_tasks enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.user_xp enable row level security;
alter table public.reward_definitions enable row level security;
alter table public.reward_unlocks enable row level security;
alter table public.unlocked_decorations enable row level security;
alter table public.reward_settings enable row level security;

-- spec_tasks: endast egen data, full CRUD på egna rader.
create policy "tasks_select_own" on public.spec_tasks
  for select to authenticated using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.spec_tasks
  for insert to authenticated with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.spec_tasks
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.spec_tasks
  for delete to authenticated using (auth.uid() = user_id);

-- xp_transactions: läsning av egen historik. Ingen skrivning från klient —
-- endast security definer-funktionerna ovan får skriva.
create policy "xp_select_own" on public.xp_transactions
  for select to authenticated using (auth.uid() = user_id);

-- user_xp: läs egen, admin läser alla.
create policy "userxp_select_own" on public.user_xp
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

-- reward_definitions: alla inloggade läser; endast admin skriver.
create policy "rewards_select_all" on public.reward_definitions
  for select to authenticated using (true);
create policy "rewards_admin_write" on public.reward_definitions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reward_unlocks / unlocked_decorations: läs egen. Ingen skrivning från klient.
create policy "unlocks_select_own" on public.reward_unlocks
  for select to authenticated using (auth.uid() = user_id);
create policy "decor_select_own" on public.unlocked_decorations
  for select to authenticated using (auth.uid() = user_id);

-- reward_settings: läs för alla, skriv endast admin.
create policy "settings_select_all" on public.reward_settings
  for select to authenticated using (true);
create policy "settings_admin_update" on public.reward_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- Behörighet: endast admin och speciallärare får använda planeraren
-- ----------------------------------------------------------------

revoke execute on function public.complete_task(uuid) from public, anon;
revoke execute on function public.reopen_task(uuid) from public, anon;
revoke execute on function public.check_reward_unlocks(uuid) from public, anon;
revoke execute on function public.refresh_user_xp(uuid) from public, anon;

grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid) to authenticated;
grant execute on function public.check_reward_unlocks(uuid) to authenticated;
grant execute on function public.refresh_user_xp(uuid) to authenticated;
