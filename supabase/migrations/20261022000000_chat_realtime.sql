-- Växverket — realtid för chatten.
--
-- Publicerar meddelandetabellen till Supabase Realtime, så att nya meddelanden
-- dyker upp i appen utan att vänta på nästa hämtning. Radnivåsäkerheten gäller
-- även här: händelser skickas bara till användare som får läsa raden enligt
-- policyn messages_select (public.can_access_channel). Ingen kan alltså se
-- meddelanden från en kanal hen inte tillhör, ens via realtid.
--
-- Migreringen är idempotent och rör ingen data. Saknas publiceringen i
-- projektet (t.ex. ett lokalt testprojekt) händer ingenting — appen fortsätter
-- då att uppdatera chatten med jämna mellanrum precis som förut.

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'supabase_realtime finns inte i det här projektet — realtid hoppas över.';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    raise notice 'public.messages är redan publicerad till realtid.';
    return;
  end if;

  alter publication supabase_realtime add table public.messages;
  raise notice 'public.messages är nu publicerad till realtid.';
end $$;

-- INSERT-händelser räcker: skickade meddelanden ändras inte (ingen update- eller
-- delete-policy finns på tabellen).
alter table public.messages replica identity default;
