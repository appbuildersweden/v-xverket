-- Elda-webbplatsen – förslag och feedback från besökare.
--
-- Besökare utan konto kan skicka ett förslag, men kan aldrig läsa, ändra eller
-- radera något. Skrivningen går bara via funktionen submit_public_feedback,
-- som validerar innehållet. Tabellen har inga skrivpolicyer för klienten.
--
-- Skydd mot missbruk är medvetet enkelt: högst 100 förslag per timme totalt.
-- Det hindrar en storskalig översvämning men identifierar inte enskilda
-- avsändare. Samla inte in kontaktuppgifter här.

create table if not exists public.public_feedback (
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('elda', 'skola')),
  message text not null check (char_length(message) between 10 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists public_feedback_created_idx
  on public.public_feedback (created_at desc);

alter table public.public_feedback enable row level security;

-- Endast administratörer kan läsa förslag, via den inloggade klienten.
drop policy if exists "public_feedback_admin_select" on public.public_feedback;
create policy "public_feedback_admin_select"
  on public.public_feedback for select
  to authenticated
  using (public.is_admin());

revoke all on public.public_feedback from anon, authenticated;
grant select on public.public_feedback to authenticated;

create or replace function public.submit_public_feedback(
  p_product text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text := trim(coalesce(p_message, ''));
  v_recent integer;
begin
  if p_product is null or p_product not in ('elda', 'skola') then
    raise exception 'Välj vilken produkt förslaget gäller.';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 2000 then
    raise exception 'Förslaget måste vara mellan 10 och 2000 tecken.';
  end if;

  select count(*) into v_recent
  from public.public_feedback
  where created_at > now() - interval '1 hour';
  if v_recent >= 100 then
    raise exception 'Det kommer för många förslag just nu. Försök igen om en stund.';
  end if;

  insert into public.public_feedback (product, message)
  values (p_product, v_message);

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.submit_public_feedback(text, text) from public;
grant execute on function public.submit_public_feedback(text, text) to anon, authenticated;
