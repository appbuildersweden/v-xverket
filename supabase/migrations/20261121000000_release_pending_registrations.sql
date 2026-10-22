-- Registreringen ska aldrig behöva vänta på en administratör.
--
-- Boten skapar kontot direkt för alla kontotyper. Tidigare ansökningar som
-- ligger kvar i 'vantar' (lärare och flaggade elevkonton) släpps därför igenom:
-- kontot aktiveras utan begränsning och ansökan markeras som skapad.
-- Varningsflaggorna ligger kvar i risk_flags så att en administratör kan
-- granska i efterhand.
--
-- Ofullständiga utkast (utan created_user_id) rörs inte — de har inget konto.

-- 1. Sessionsmetadata först, så att nästa inloggning inte bär limited=true.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('limited', false)
where exists (
  select 1
  from public.registration_applications a
  where a.created_user_id = u.id
    and a.status = 'vantar'
);

-- 2. Kontot: aktivt och utan begränsning.
update public.profiles p
set limited = false,
    active = true
from public.registration_applications a
where a.created_user_id = p.id
  and a.status = 'vantar';

-- 3. Ansökan: klar i stället för väntande.
update public.registration_applications
set status = 'skapad',
    decided_at = coalesce(decided_at, now()),
    updated_at = now()
where status = 'vantar'
  and created_user_id is not null;
