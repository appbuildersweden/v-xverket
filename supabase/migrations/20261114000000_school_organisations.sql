-- Elda Skola – skolorganisationer, medlemskap och organisationsseparerad kommunikation.
--
-- Migrationen är additiv. Inga rader tas bort och ingen befintlig data ändras.
-- Poster som saknar organisation får organisation_id = null och behandlas som
-- "ännu inte kopplad": de syns kvar för sina befintliga deltagare, men kan inte
-- användas för nya vanliga interna meddelanden och kan inte kopplas till en
-- skola genom gissning. En systemadministratör kopplar dem uttryckligen.
--
-- Rollmodellen är oförändrad: admin = systemadministratör, lärare, speciallärare
-- och elev. Det finns ingen skolchefsroll.

-- ================================================================
-- 1. Organisationer och medlemskap
-- ================================================================

create table if not exists public.school_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  contact_email text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_organisations_name_idx
  on public.school_organisations (lower(btrim(name)));

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.school_organisations (id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  assigned_by uuid references auth.users (id) on delete set null
);

create index if not exists school_memberships_user_idx
  on public.school_memberships (user_id, left_at);
create index if not exists school_memberships_org_idx
  on public.school_memberships (organisation_id, left_at);

-- Ett konto har högst en aktiv skolorganisation. Historiken bevaras som
-- avslutade rader, så ett skolbyte går att följa utan att gamla data raderas.
create unique index if not exists school_memberships_one_active_idx
  on public.school_memberships (user_id) where left_at is null;

alter table public.school_organisations enable row level security;
alter table public.school_memberships enable row level security;

-- Policyerna skapas efter hjälpfunktionerna nedan, eftersom de refererar
-- current_school_org(). En policy löser sina funktioner direkt när den skapas.
--
-- Ingen insert/update/delete-policy: medlemskap skrivs bara av funktionerna
-- nedan (och av serverfunktionerna med service role).

-- ================================================================
-- 2. Hjälpfunktioner
-- ================================================================

/** Den inloggades aktiva skolorganisation, eller null om kontot saknar skola. */
create or replace function public.current_school_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organisation_id
  from public.school_memberships m
  where m.user_id = auth.uid()
    and m.left_at is null
  limit 1;
$$;

revoke all on function public.current_school_org() from public, anon;
grant execute on function public.current_school_org() to authenticated;

/** Sant om kontot har en aktiv, aktiv skolorganisation. */
create or replace function public.has_school_org()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.school_organisations o on o.id = m.organisation_id
    where m.user_id = auth.uid()
      and m.left_at is null
      and o.active
  );
$$;

revoke all on function public.has_school_org() from public, anon;
grant execute on function public.has_school_org() to authenticated;

/** Sant om två konton tillhör samma aktiva skolorganisation. */
create or replace function public.same_school_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and exists (
       select 1
       from public.school_memberships mine
       join public.school_memberships theirs
         on theirs.organisation_id = mine.organisation_id
       join public.school_organisations o on o.id = mine.organisation_id
       where mine.user_id = auth.uid()
         and theirs.user_id = p_user
         and mine.left_at is null
         and theirs.left_at is null
         and o.active
     );
$$;

revoke all on function public.same_school_org(uuid) from public, anon;
grant execute on function public.same_school_org(uuid) to authenticated;

drop policy if exists "school_organisations_select_own_or_admin" on public.school_organisations;
create policy "school_organisations_select_own_or_admin"
  on public.school_organisations for select
  to authenticated
  using (
    public.is_admin()
    or id = public.current_school_org()
  );

drop policy if exists "school_memberships_select_own_or_admin" on public.school_memberships;
create policy "school_memberships_select_own_or_admin"
  on public.school_memberships for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

/**
 * Sant när två konton får dela skolrelaterad data. Regeln är att de ska tillhöra
 * samma skolorganisation. Poster som skapades före organisationskopplingen (ett
 * av kontona saknar aktiv skola) behåller sin befintliga åtkomst – annars skulle
 * data bli oläsbar för de användare som redan arbetar i den. Nya kopplingar
 * kräver alltid samma skola.
 */
create or replace function public.school_orgs_compatible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and (
       public.same_school_org(p_user)
       or public.current_school_org() is null
       or not exists (
         select 1 from public.school_memberships m
         where m.user_id = p_user and m.left_at is null
       )
     );
$$;

revoke all on function public.school_orgs_compatible(uuid) from public, anon;
grant execute on function public.school_orgs_compatible(uuid) to authenticated;

/** Roll för ett annat konto, utan att läcka profildata. */
create or replace function public.school_role_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = p_user;
$$;

revoke all on function public.school_role_of(uuid) from public, anon;
grant execute on function public.school_role_of(uuid) to authenticated;

-- ================================================================
-- 3. Organisation på befintliga poster
-- ================================================================

alter table public.classes
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.student_tasks
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.documents
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.school_announcements
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.school_events
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.school_activities
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.school_adaptations
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.school_messages
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;
alter table public.chat_channels
  add column if not exists organisation_id uuid references public.school_organisations (id) on delete set null;

create index if not exists classes_org_idx on public.classes (organisation_id);
create index if not exists student_tasks_org_idx on public.student_tasks (organisation_id);
create index if not exists documents_org_idx on public.documents (organisation_id);
create index if not exists school_announcements_org_idx on public.school_announcements (organisation_id);
create index if not exists school_events_org_idx on public.school_events (organisation_id);
create index if not exists school_activities_org_idx on public.school_activities (organisation_id);
create index if not exists school_adaptations_org_idx on public.school_adaptations (organisation_id);
create index if not exists chat_channels_org_idx on public.chat_channels (organisation_id);

/**
 * Nya poster ärver skaparens skolorganisation. Värdet sätts aldrig av
 * klienten och aldrig genom gissning: saknar skaparen en organisation förblir
 * kolumnen null och posten är inte kopplad till någon skola.
 */
create or replace function public.elda_skola_inherit_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_id is null then
    new.organisation_id := public.current_school_org();
  end if;
  return new;
end;
$$;

drop trigger if exists classes_inherit_org on public.classes;
create trigger classes_inherit_org
  before insert on public.classes
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists student_tasks_inherit_org on public.student_tasks;
create trigger student_tasks_inherit_org
  before insert on public.student_tasks
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists documents_inherit_org on public.documents;
create trigger documents_inherit_org
  before insert on public.documents
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists school_announcements_inherit_org on public.school_announcements;
create trigger school_announcements_inherit_org
  before insert on public.school_announcements
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists school_events_inherit_org on public.school_events;
create trigger school_events_inherit_org
  before insert on public.school_events
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists school_activities_inherit_org on public.school_activities;
create trigger school_activities_inherit_org
  before insert on public.school_activities
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists school_adaptations_inherit_org on public.school_adaptations;
create trigger school_adaptations_inherit_org
  before insert on public.school_adaptations
  for each row execute function public.elda_skola_inherit_org();

drop trigger if exists chat_channels_inherit_org on public.chat_channels;
create trigger chat_channels_inherit_org
  before insert on public.chat_channels
  for each row execute function public.elda_skola_inherit_org();

-- ================================================================
-- 4. Klassmedlemskap kräver samma skolorganisation
-- ================================================================

/**
 * Ett klassmedlemskap får bara skapas inom klassens skolorganisation. Klassen
 * och personen måste vara kopplade till samma skola. Legacy-klasser utan
 * organisation behåller sina befintliga medlemmar men kan inte få nya
 * medlemmar från en annan skola.
 */
create or replace function public.elda_skola_class_member_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_org uuid;
  v_user_org uuid;
begin
  select organisation_id into v_class_org from public.classes where id = new.class_id;
  select organisation_id into v_user_org
  from public.school_memberships
  where user_id = new.user_id and left_at is null
  limit 1;

  if v_class_org is not null and v_user_org is distinct from v_class_org then
    raise exception 'Personen tillhör en annan skolorganisation än klassen.';
  end if;

  return new;
end;
$$;

drop trigger if exists class_members_same_org on public.class_members;
create trigger class_members_same_org
  before insert or update on public.class_members
  for each row execute function public.elda_skola_class_member_same_org();

-- ================================================================
-- 5. Kommunikation: samma organisation är ett krav
-- ================================================================

/**
 * Kanalåtkomst. En direktkanal kräver att båda parterna har samma aktiva
 * skolorganisation; en klasskanal kräver klassmedlemskap. En kanal som skapades
 * före organisationskopplingen (båda parter saknar skola) nekas, så att ett
 * okopplat konto aldrig kan använda vanliga interna meddelanden.
 */
create or replace function public.can_access_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
    where c.id = p_channel
      and (
        (c.kind = 'direkt'
          and auth.uid() in (c.dm_user_a, c.dm_user_b)
          and c.dm_user_a is not null
          and c.dm_user_b is not null
          and public.same_school_org(c.dm_user_a)
          and public.same_school_org(c.dm_user_b))
        or (c.kind = 'klass'
          and c.class_id is not null
          and public.is_class_member(c.class_id)
          and (c.organisation_id is null or c.organisation_id = public.current_school_org()))
        or (c.kind = 'global'
          and c.organisation_id is not null
          and c.organisation_id = public.current_school_org())
      )
  );
$$;

revoke all on function public.can_access_channel(uuid) from public, anon;
grant execute on function public.can_access_channel(uuid) to authenticated;

-- Globala kanaler är avstängda i Elda Skola: all kommunikation sker inom en
-- skolorganisation. Ingen ny global kanal kan skapas.
drop policy if exists "chat_channels_direct_insert" on public.chat_channels;
create policy "chat_channels_direct_insert"
  on public.chat_channels for insert
  to authenticated
  with check (
    kind = 'direkt'
    and auth.uid() in (dm_user_a, dm_user_b)
    and public.has_school_org()
    and public.same_school_org(
      case when dm_user_a = auth.uid() then dm_user_b else dm_user_a end
    )
  );

drop policy if exists "chat_channels_class_insert" on public.chat_channels;
create policy "chat_channels_class_insert"
  on public.chat_channels for insert
  to authenticated
  with check (
    kind = 'klass'
    and class_id is not null
    and public.is_class_teacher(class_id)
  );

/**
 * Startar en direktkanal. Reglerna är desamma oavsett roll:
 *   * båda måste tillhöra samma skolorganisation
 *   * eleven kan bara nå lärare/speciallärare som undervisar eller är kopplad
 *   * personal kan nå elever de undervisar eller är kopplade till
 *   * personal kan nå annan personal på samma skola
 *   * elev ↔ elev nekas
 */
create or replace function public.open_direct_channel(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_my_role text;
  v_other_role text;
  v_id uuid;
  v_allowed boolean := false;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'Välj en annan person.';
  end if;
  if not public.has_school_org() then
    raise exception 'Ditt konto är inte kopplat till en skola. Kontakta systemadministratören.';
  end if;
  if not public.same_school_org(p_other) then
    raise exception 'Personen tillhör en annan skola. Interna meddelanden går bara inom den egna skolan.';
  end if;

  v_my_role := public.current_app_role();
  v_other_role := public.school_role_of(p_other);
  if v_other_role is null then
    raise exception 'Kontot hittades inte.';
  end if;

  if v_my_role = 'elev' then
    v_allowed := v_other_role in ('lärare', 'speciallärare')
      and (
        public.teaches_student(v_me)
        or exists (
          select 1 from public.class_members mine
          join public.class_members theirs on theirs.class_id = mine.class_id
          where mine.user_id = v_me and theirs.user_id = p_other
            and theirs.member_role = 'larare'
        )
      );
  elsif v_my_role in ('lärare', 'speciallärare') then
    v_allowed := v_other_role in ('lärare', 'speciallärare')
      or (v_other_role = 'elev'
        and (
          public.teaches_student(p_other)
          or exists (
            select 1 from public.student_links l
            where l.speciallarare_id = v_me and l.elev_id = p_other
          )
        ));
  end if;

  if not v_allowed then
    raise exception 'Du har inte behörighet att starta en konversation med den personen.';
  end if;

  if v_me < p_other then
    v_a := v_me;
    v_b := p_other;
  else
    v_a := p_other;
    v_b := v_me;
  end if;

  select id into v_id
  from public.chat_channels
  where kind = 'direkt' and dm_user_a = v_a and dm_user_b = v_b;

  if v_id is null then
    insert into public.chat_channels (kind, dm_user_a, dm_user_b, created_by, organisation_id)
    values ('direkt', v_a, v_b, v_me, public.current_school_org())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.open_direct_channel(uuid) from public, anon;
grant execute on function public.open_direct_channel(uuid) to authenticated;

/** Skickar ett meddelande i en tillåten kanal. Kräver samma skola. */
create or replace function public.send_message(p_channel uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_row record;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if not public.has_school_org() then
    raise exception 'Ditt konto är inte kopplat till en skola. Kontakta systemadministratören.';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'Skriv ett meddelande först.';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Meddelandet är för långt (max 4000 tecken).';
  end if;
  if not public.can_access_channel(p_channel) then
    raise exception 'Du har inte tillgång till den konversationen.';
  end if;

  insert into public.messages (channel_id, sender_id, body)
  values (p_channel, v_me, v_body)
  returning id, channel_id, sender_id, body, created_at into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'channel_id', v_row.channel_id,
    'sender_id', v_row.sender_id,
    'body', v_row.body,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- Läsmarkering per kanal och användare. Skrivs bara av användaren själv.
create table if not exists public.chat_reads (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.chat_reads enable row level security;

drop policy if exists "chat_reads_own" on public.chat_reads;
create policy "chat_reads_own"
  on public.chat_reads for all
  to authenticated
  using (user_id = auth.uid() and public.can_access_channel(channel_id))
  with check (user_id = auth.uid() and public.can_access_channel(channel_id));

/**
 * Mina direkta samtal, med motpart och sista meddelandet.
 *
 * Returtypen utökas jämfört med den tidigare versionen, och en funktion kan
 * inte byta returtyp med CREATE OR REPLACE. Därför släpps den gamla
 * definitionen först – inga data påverkas, bara funktionssignaturen.
 */
drop function if exists public.list_my_direct_channels();
create function public.list_my_direct_channels()
returns table (
  channel_id uuid,
  other_id uuid,
  other_username text,
  other_name text,
  other_role text,
  last_body text,
  last_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    other.id,
    other.username,
    coalesce(nullif(trim(concat_ws(' ', other.first_name, other.last_name)), ''), other.username),
    other.role,
    last_msg.body,
    last_msg.created_at,
    (
      select count(*)::int
      from public.messages m
      where m.channel_id = c.id
        and m.sender_id <> auth.uid()
        and (last_read.last_read_at is null or m.created_at > last_read.last_read_at)
    )
  from public.chat_channels c
  join lateral (
    select p.id, p.username, p.first_name, p.last_name, p.role
    from public.profiles p
    where p.id = case when c.dm_user_a = auth.uid() then c.dm_user_b else c.dm_user_a end
  ) as other on true
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.channel_id = c.id
    order by m.created_at desc
    limit 1
  ) as last_msg on true
  left join lateral (
    select max(r.read_at) as last_read_at
    from public.chat_reads r
    where r.channel_id = c.id and r.user_id = auth.uid()
  ) as last_read on true
  where c.kind = 'direkt'
    and auth.uid() in (c.dm_user_a, c.dm_user_b)
    and public.same_school_org(other.id)
  order by last_msg.created_at desc nulls last, other.username;
$$;

revoke all on function public.list_my_direct_channels() from public, anon;
grant execute on function public.list_my_direct_channels() to authenticated;

create or replace function public.mark_channel_read(p_channel uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.chat_reads (channel_id, user_id, read_at)
  select p_channel, auth.uid(), now()
  where public.can_access_channel(p_channel)
  on conflict (channel_id, user_id) do update set read_at = now();
$$;

revoke all on function public.mark_channel_read(uuid) from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;

/**
 * Tillåtna mottagare för den inloggade, begränsat till den egna skolan.
 * Listan är den enda källa gränssnittet använder för mottagarval.
 */
create or replace function public.list_message_contacts()
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  organisation_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_app_role() as role, auth.uid() as uid
  )
  select distinct
    p.id,
    p.username,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    p.role,
    o.name
  from public.profiles p
  join public.school_memberships m
    on m.user_id = p.id and m.left_at is null
  join public.school_organisations o on o.id = m.organisation_id and o.active
  cross join me
  where p.id <> me.uid
    and p.active
    and m.organisation_id = public.current_school_org()
    and (
      (me.role = 'elev'
        and p.role in ('lärare', 'speciallärare')
        and exists (
          select 1 from public.class_members mine
          join public.class_members theirs on theirs.class_id = mine.class_id
          where mine.user_id = me.uid
            and theirs.user_id = p.id
            and theirs.member_role = 'larare'
        ))
      or (me.role in ('lärare', 'speciallärare')
        and (
          p.role in ('lärare', 'speciallärare')
          or (p.role = 'elev'
            and (
              public.teaches_student(p.id)
              or exists (
                select 1 from public.student_links l
                where l.speciallarare_id = me.uid and l.elev_id = p.id
              )
            ))
        ))
    )
  order by 3;
$$;

revoke all on function public.list_message_contacts() from public, anon;
grant execute on function public.list_message_contacts() to authenticated;

-- ================================================================
-- 6. Speciallärarens elever
-- ================================================================

/**
 * En speciallärare som är kopplad till eleven räknas som behörig personal för
 * eleven – men bara inom samma skolorganisation. Det gör att kopplade
 * speciallärare kan läsa och hantera elevstöd enligt sina rättigheter, utan att
 * få åtkomst till elever de inte arbetar med.
 */
create or replace function public.elda_skola_teaches(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student is not null
     and public.school_orgs_compatible(p_student)
     and (
       public.is_admin()
       or exists (
         select 1 from public.student_links l
         where l.speciallarare_id = auth.uid()
           and l.elev_id = p_student
       )
       or exists (
         select 1
         from public.class_members student
         join public.class_members teacher on teacher.class_id = student.class_id
         where student.user_id = p_student
           and teacher.user_id = auth.uid()
           and teacher.member_role = 'larare'
       )
     );
$$;

revoke all on function public.elda_skola_teaches(uuid) from public, anon;
grant execute on function public.elda_skola_teaches(uuid) to authenticated;

/** Elever specialläraren arbetar med: kopplade elever och elever i egna klasser. */
create or replace function public.elda_skola_my_special_students()
returns table (
  id uuid,
  username text,
  display_name text,
  class_name text,
  adaptations int,
  open_adaptations int,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    coalesce((
      select string_agg(distinct c.name, ', ')
      from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.user_id = p.id
    ), ''),
    coalesce((
      select count(*)::int from public.school_adaptations a where a.student_id = p.id
    ), 0),
    coalesce((
      select count(*)::int from public.school_adaptations a
      where a.student_id = p.id and a.status = 'aktiv'
    ), 0),
    (
      select max(a.updated_at) from public.school_adaptations a where a.student_id = p.id
    )
  from public.profiles p
  where p.role = 'elev'
    and p.active
    and public.current_app_role() in ('lärare', 'speciallärare')
    and public.same_school_org(p.id)
    and (
      exists (
        select 1 from public.student_links l
        where l.speciallarare_id = auth.uid() and l.elev_id = p.id
      )
      or public.teaches_student(p.id)
    )
  order by 3;
$$;

revoke all on function public.elda_skola_my_special_students() from public, anon;
grant execute on function public.elda_skola_my_special_students() to authenticated;

/** Kopplar en elev till specialläraren. Kräver samma skolorganisation. */
create or replace function public.elda_skola_link_student(p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if public.current_app_role() not in ('lärare', 'speciallärare') then
    raise exception 'Endast personal får koppla elever.';
  end if;
  if not public.has_school_org() then
    raise exception 'Ditt konto är inte kopplat till en skola.';
  end if;
  if not public.same_school_org(p_student) then
    raise exception 'Eleven tillhör en annan skola.';
  end if;
  select role into v_role from public.profiles where id = p_student;
  if v_role is distinct from 'elev' then
    raise exception 'Endast elevkonton kan kopplas.';
  end if;

  insert into public.student_links (speciallarare_id, elev_id)
  values (auth.uid(), p_student)
  on conflict (speciallarare_id, elev_id) do nothing;
end;
$$;

revoke all on function public.elda_skola_link_student(uuid) from public, anon;
grant execute on function public.elda_skola_link_student(uuid) to authenticated;

-- ================================================================
-- 7. Systemadministratörens organisationer
-- ================================================================

create or replace function public.elda_skola_admin_organisations()
returns table (
  id uuid,
  name text,
  slug text,
  contact_email text,
  active boolean,
  members int,
  students int,
  teachers int,
  special_teachers int,
  classes int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    o.contact_email,
    o.active,
    (select count(*)::int from public.school_memberships m where m.organisation_id = o.id and m.left_at is null),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'elev'),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'lärare'),
    (select count(*)::int from public.school_memberships m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.left_at is null and p.role = 'speciallärare'),
    (select count(*)::int from public.classes c where c.organisation_id = o.id),
    o.created_at
  from public.school_organisations o
  where public.is_admin()
  order by o.active desc, o.name;
$$;

revoke all on function public.elda_skola_admin_organisations() from public, anon;
grant execute on function public.elda_skola_admin_organisations() to authenticated;

/** Skapa eller uppdatera en skolorganisation. Endast systemadministratör. */
create or replace function public.elda_skola_admin_save_organisation(
  p_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_contact_email text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får hantera skolor.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Skolans namn måste vara 2–120 tecken.';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Kortnamnet får bara innehålla a–z, siffror och bindestreck.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Kontaktadressen måste vara en giltig e-postadress.';
  end if;

  if p_id is null then
    insert into public.school_organisations (name, slug, contact_email, active, created_by)
    values (v_name, v_slug, v_email, coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.school_organisations
       set name = v_name,
           slug = v_slug,
           contact_email = v_email,
           active = coalesce(p_active, true),
           updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Skolan hittades inte.';
    end if;
  end if;

  perform public.log_audit(
    'school.organisation.saved', 'organisation', v_id::text,
    jsonb_build_object('name', v_name, 'active', coalesce(p_active, true))
  );
  return v_id;
end;
$$;

revoke all on function public.elda_skola_admin_save_organisation(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.elda_skola_admin_save_organisation(uuid, text, text, text, boolean) to authenticated;

create or replace function public.elda_skola_admin_set_organisation_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får ändra skolors status.';
  end if;
  if not exists (select 1 from public.school_organisations where id = p_id) then
    raise exception 'Skolan hittades inte.';
  end if;
  update public.school_organisations
     set active = coalesce(p_active, false), updated_at = now()
   where id = p_id;
  perform public.log_audit(
    'school.organisation.active', 'organisation', p_id::text,
    jsonb_build_object('active', coalesce(p_active, false))
  );
end;
$$;

revoke all on function public.elda_skola_admin_set_organisation_active(uuid, boolean) from public, anon;
grant execute on function public.elda_skola_admin_set_organisation_active(uuid, boolean) to authenticated;

/**
 * Kopplar ett konto till en skola. Ett befintligt aktivt medlemskap avslutas
 * (historiken bevaras) innan det nya skapas, så ett skolbyte är spårbart och
 * åtkomsten till den gamla skolans privata kommunikation upphör direkt.
 */
create or replace function public.elda_skola_admin_assign_membership(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får koppla konton till skolor.';
  end if;
  if p_user is null then
    raise exception 'Välj ett konto.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Kontot hittades inte.';
  end if;
  if p_org is not null and not exists (select 1 from public.school_organisations where id = p_org) then
    raise exception 'Skolan hittades inte.';
  end if;

  update public.school_memberships
     set left_at = now()
   where user_id = p_user and left_at is null;

  if p_org is not null then
    insert into public.school_memberships (user_id, organisation_id, assigned_by)
    values (p_user, p_org, auth.uid());
  end if;

  perform public.log_audit(
    'school.membership.assigned', 'profile', p_user::text,
    jsonb_build_object('organisation', p_org)
  );
end;
$$;

revoke all on function public.elda_skola_admin_assign_membership(uuid, uuid) from public, anon;
grant execute on function public.elda_skola_admin_assign_membership(uuid, uuid) to authenticated;

/** Alla konton med sin aktiva skola. Endast systemadministratör. */
create or replace function public.elda_skola_admin_memberships()
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  active boolean,
  organisation_id uuid,
  organisation_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    p.role,
    p.active,
    o.id,
    o.name
  from public.profiles p
  left join public.school_memberships m on m.user_id = p.id and m.left_at is null
  left join public.school_organisations o on o.id = m.organisation_id
  where public.is_admin()
  order by (o.name is null) desc, o.name, p.username;
$$;

revoke all on function public.elda_skola_admin_memberships() from public, anon;
grant execute on function public.elda_skola_admin_memberships() to authenticated;

-- ================================================================
-- 8. Publiceringar: nyheter, kommande uppdateringar, viktig information
-- ================================================================

create table if not exists public.school_publications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nyhet', 'uppdatering', 'viktig')),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  summary text check (summary is null or char_length(summary) <= 400),
  body text check (body is null or char_length(body) <= 20000),
  link_url text check (link_url is null or link_url ~ '^https?://'),
  link_label text,
  status text not null default 'utkast' check (status in ('utkast', 'publicerad', 'arkiverad')),
  audience_organisation_ids uuid[],
  audience_roles text[],
  audience_user_ids uuid[],
  publish_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_publications_feed_idx
  on public.school_publications (status, publish_at desc);

alter table public.school_publications enable row level security;

/**
 * En publicering syns bara för den den är avsedd för: publicerad, publicerad
 * nu, och antingen för alla skolor eller för läsarens skola/roll/konto.
 */
drop policy if exists "school_publications_select_audience" on public.school_publications;
create policy "school_publications_select_audience"
  on public.school_publications for select
  to authenticated
  using (
    public.is_admin()
    or (
      status = 'publicerad'
      and publish_at <= now()
      and (audience_organisation_ids is null
        or public.current_school_org() = any (audience_organisation_ids))
      and (audience_roles is null
        or public.current_app_role() = any (audience_roles))
      and (audience_user_ids is null
        or auth.uid() = any (audience_user_ids))
    )
  );

create or replace function public.elda_skola_list_publications()
returns table (
  id uuid,
  kind text,
  title text,
  summary text,
  body text,
  link_url text,
  link_label text,
  publish_at timestamptz,
  author_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.kind,
    p.title,
    p.summary,
    p.body,
    p.link_url,
    p.link_label,
    p.publish_at,
    coalesce(nullif(trim(concat_ws(' ', a.first_name, a.last_name)), ''), a.username, 'Elda Skola')
  from public.school_publications p
  left join public.profiles a on a.id = p.created_by
  where p.status = 'publicerad'
    and p.publish_at <= now()
    and (p.audience_organisation_ids is null
      or public.current_school_org() = any (p.audience_organisation_ids))
    and (p.audience_roles is null
      or public.current_app_role() = any (p.audience_roles))
    and (p.audience_user_ids is null
      or auth.uid() = any (p.audience_user_ids))
  order by
    case p.kind when 'viktig' then 0 when 'nyhet' then 1 else 2 end,
    p.publish_at desc;
$$;

revoke all on function public.elda_skola_list_publications() from public, anon;
grant execute on function public.elda_skola_list_publications() to authenticated;

create or replace function public.elda_skola_admin_publications()
returns table (
  id uuid,
  kind text,
  title text,
  summary text,
  body text,
  link_url text,
  link_label text,
  status text,
  audience_organisation_ids uuid[],
  audience_roles text[],
  audience_user_ids uuid[],
  publish_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.kind, p.title, p.summary, p.body, p.link_url, p.link_label, p.status,
    p.audience_organisation_ids, p.audience_roles, p.audience_user_ids,
    p.publish_at, p.updated_at
  from public.school_publications p
  where public.is_admin()
  order by p.updated_at desc;
$$;

revoke all on function public.elda_skola_admin_publications() from public, anon;
grant execute on function public.elda_skola_admin_publications() to authenticated;

create or replace function public.elda_skola_admin_save_publication(
  p_id uuid default null,
  p_kind text default 'nyhet',
  p_title text default null,
  p_summary text default null,
  p_body text default null,
  p_link_url text default null,
  p_link_label text default null,
  p_status text default 'utkast',
  p_organisation_ids uuid[] default null,
  p_roles text[] default null,
  p_user_ids uuid[] default null,
  p_publish_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'nyhet');
  v_title text := btrim(coalesce(p_title, ''));
  v_status text := coalesce(nullif(btrim(p_status), ''), 'utkast');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får publicera.';
  end if;
  if v_kind not in ('nyhet', 'uppdatering', 'viktig') then
    raise exception 'Ogiltig typ av publicering.';
  end if;
  if v_status not in ('utkast', 'publicerad', 'arkiverad') then
    raise exception 'Ogiltig status.';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'Ge publiceringen en rubrik.';
  end if;
  if p_link_url is not null and btrim(p_link_url) <> '' and btrim(p_link_url) !~ '^https?://' then
    raise exception 'Länken måste börja med http:// eller https://.';
  end if;

  if p_id is null then
    insert into public.school_publications (
      kind, title, summary, body, link_url, link_label, status,
      audience_organisation_ids, audience_roles, audience_user_ids,
      publish_at, created_by
    ) values (
      v_kind,
      v_title,
      nullif(btrim(coalesce(p_summary, '')), ''),
      nullif(btrim(coalesce(p_body, '')), ''),
      nullif(btrim(coalesce(p_link_url, '')), ''),
      nullif(btrim(coalesce(p_link_label, '')), ''),
      v_status,
      p_organisation_ids,
      p_roles,
      p_user_ids,
      coalesce(p_publish_at, now()),
      auth.uid()
    )
    returning id into v_id;
  else
    update public.school_publications
       set kind = v_kind,
           title = v_title,
           summary = nullif(btrim(coalesce(p_summary, '')), ''),
           body = nullif(btrim(coalesce(p_body, '')), ''),
           link_url = nullif(btrim(coalesce(p_link_url, '')), ''),
           link_label = nullif(btrim(coalesce(p_link_label, '')), ''),
           status = v_status,
           audience_organisation_ids = p_organisation_ids,
           audience_roles = p_roles,
           audience_user_ids = p_user_ids,
           publish_at = coalesce(p_publish_at, publish_at),
           updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Publiceringen hittades inte.';
    end if;
  end if;

  perform public.log_audit(
    'school.publication.saved', 'publication', v_id::text,
    jsonb_build_object('kind', v_kind, 'status', v_status)
  );
  return v_id;
end;
$$;

revoke all on function public.elda_skola_admin_save_publication(uuid, text, text, text, text, text, text, text, uuid[], text[], uuid[], timestamptz) from public, anon;
grant execute on function public.elda_skola_admin_save_publication(uuid, text, text, text, text, text, text, text, uuid[], text[], uuid[], timestamptz) to authenticated;

create or replace function public.elda_skola_admin_set_publication_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får ändra publiceringar.';
  end if;
  if p_status not in ('utkast', 'publicerad', 'arkiverad') then
    raise exception 'Ogiltig status.';
  end if;
  update public.school_publications
     set status = p_status, updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'Publiceringen hittades inte.';
  end if;
  perform public.log_audit(
    'school.publication.status', 'publication', p_id::text,
    jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function public.elda_skola_admin_set_publication_status(uuid, text) from public, anon;
grant execute on function public.elda_skola_admin_set_publication_status(uuid, text) to authenticated;

-- ================================================================
-- 9. Systemutskick över skolgränser (endast systemadministratören)
-- ================================================================

/**
 * Skickar ett systemmeddelande. Mottagare väljs som en kombination av skolor,
 * roller och enskilda konton. Endast systemadministratören kan anropa
 * funktionen, och ett systemutskick är alltid skilt från privata
 * konversationer: det hamnar i mottagarens "Från skolan".
 */
create or replace function public.elda_skola_send_system_message(
  p_subject text,
  p_body text,
  p_organisation_ids uuid[] default null,
  p_roles text[] default null,
  p_user_ids uuid[] default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Endast systemadministratören får skicka systemmeddelanden.';
  end if;
  if char_length(v_subject) < 2 then
    raise exception 'Ge meddelandet en rubrik (minst 2 tecken).';
  end if;
  if char_length(v_body) < 2 then
    raise exception 'Skriv ett meddelande.';
  end if;
  if coalesce(array_length(p_organisation_ids, 1), 0) = 0
     and coalesce(array_length(p_roles, 1), 0) = 0
     and coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'Välj minst en mottagare.';
  end if;

  insert into public.school_messages (sender_id, subject, body, audience)
  values (auth.uid(), v_subject, v_body, 'system')
  returning id into v_id;

  insert into public.school_message_recipients (message_id, user_id)
  select distinct v_id, p.id
  from public.profiles p
  left join public.school_memberships m
    on m.user_id = p.id and m.left_at is null
  where p.active
    and (
      (coalesce(array_length(p_user_ids, 1), 0) > 0 and p.id = any (p_user_ids))
      or (
        (coalesce(array_length(p_organisation_ids, 1), 0) = 0
          or m.organisation_id = any (p_organisation_ids))
        and (coalesce(array_length(p_roles, 1), 0) = 0
          or p.role = any (p_roles))
        and (coalesce(array_length(p_organisation_ids, 1), 0) > 0
          or coalesce(array_length(p_roles, 1), 0) > 0
          or coalesce(array_length(p_user_ids, 1), 0) > 0)
      )
    )
  on conflict do nothing;

  get diagnostics v_count = row_count;

  perform public.log_audit(
    'school.system_message.sent', 'message', v_id::text,
    jsonb_build_object('recipients', v_count)
  );
  return v_count;
end;
$$;

revoke all on function public.elda_skola_send_system_message(text, text, uuid[], text[], uuid[]) from public, anon;
grant execute on function public.elda_skola_send_system_message(text, text, uuid[], text[], uuid[]) to authenticated;

/** Förhandsgranskning: vilka skulle få utskicket? Endast systemadministratör. */
create or replace function public.elda_skola_system_message_audience(
  p_organisation_ids uuid[] default null,
  p_roles text[] default null,
  p_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  role text,
  organisation_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    p.id,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
    p.username,
    p.role,
    coalesce(o.name, 'Ingen skola')
  from public.profiles p
  left join public.school_memberships m on m.user_id = p.id and m.left_at is null
  left join public.school_organisations o on o.id = m.organisation_id
  where public.is_admin()
    and p.active
    and (
      (coalesce(array_length(p_user_ids, 1), 0) > 0 and p.id = any (p_user_ids))
      or (
        (coalesce(array_length(p_organisation_ids, 1), 0) = 0
          or m.organisation_id = any (p_organisation_ids))
        and (coalesce(array_length(p_roles, 1), 0) = 0
          or p.role = any (p_roles))
        and (coalesce(array_length(p_organisation_ids, 1), 0) > 0
          or coalesce(array_length(p_roles, 1), 0) > 0
          or coalesce(array_length(p_user_ids, 1), 0) > 0)
      )
    )
  order by 5, 2;
$$;

revoke all on function public.elda_skola_system_message_audience(uuid[], text[], uuid[]) from public, anon;
grant execute on function public.elda_skola_system_message_audience(uuid[], text[], uuid[]) to authenticated;

-- Den gamla mottagargruppen 'system' måste rymmas i school_messages.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.school_messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%audience%'
  loop
    execute format('alter table public.school_messages drop constraint %I', c.conname);
  end loop;

  alter table public.school_messages
    add constraint school_messages_audience_check
    check (audience in ('klass', 'larare', 'elever', 'anvandare', 'system'));
exception when others then
  raise notice 'Kunde inte vidga mottagargrupperna på school_messages: %', sqlerrm;
end $$;

/**
 * Den äldre utskicksfunktionen kunde skicka till alla lärare eller elever i
 * hela systemet utan att fråga efter skola. Den ersätts helt av
 * elda_skola_send_system_message ovan, som alltid kräver ett uttalat urval.
 */
revoke execute on function public.elda_skola_send_message(text, text, text, uuid, uuid[])
  from authenticated;

-- ================================================================
-- 10. Skolans namn per organisation
-- ================================================================

/** Skolans namn för den inloggade, med fallback till de gamla inställningarna. */
create or replace function public.elda_skola_my_organisation()
returns table (
  id uuid,
  name text,
  contact_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.contact_email
  from public.school_organisations o
  where o.id = public.current_school_org();
$$;

revoke all on function public.elda_skola_my_organisation() from public, anon;
grant execute on function public.elda_skola_my_organisation() to authenticated;
