-- ================================================================
-- Privat elev: kontotypen prövas före granskningsflaggan
-- ================================================================
-- 20261025000000 införde spärren mot klassmedlemskap för privata konton, men
-- lade den efter kontrollen av `limited`. Ett konto som väntar på granskning
-- (limited) fick därför beskedet "Kontot är begränsat" i stället för beskedet
-- om kontotypen.
--
-- Kontotypen är en varaktig egenskap, medan `limited` är en tillfällig
-- granskningsflagga. Den varaktiga orsaken ska därför nämnas först: den säger
-- vad eleven faktiskt kan göra åt saken (kontakta skolan för ett skolkonto)
-- och den går att pröva även medan granskningskön är aktiv.
--
-- Idempotent: create or replace, ingen dataändring.

create or replace function public.request_class_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_class public.classes;
  v_limited boolean;
  v_account_type text;
  v_status text;
begin
  if v_me is null then
    raise exception 'Ej inloggad.';
  end if;
  if v_code = '' then
    raise exception 'Ange klasskoden du har fått av din lärare.';
  end if;

  select limited, account_type into v_limited, v_account_type
  from public.profiles where id = v_me;

  -- Ett privat konto studerar självständigt och har ingen klass, ingen
  -- klasslista och ingen klasschatt. Klassen kräver ett skolkonto; det sätter
  -- administratören, aldrig eleven själv.
  if coalesce(v_account_type, 'skola') = 'privat' then
    raise exception 'Ditt konto är ett privat konto och kan inte gå med i en klass. Kontakta skolan om du vill ha ett skolkonto.';
  end if;

  if coalesce(v_limited, false) then
    raise exception 'Kontot är begränsat. Kontakta administratören.';
  end if;

  select * into v_class
  from public.classes
  where join_code = v_code and not archived;

  if v_class.id is null then
    raise exception 'Klasskoden stämmer inte. Kontrollera med din lärare.';
  end if;

  if exists (
    select 1 from public.class_members m
    where m.class_id = v_class.id and m.user_id = v_me
  ) then
    raise exception 'Du är redan med i den klassen.';
  end if;

  select status into v_status
  from public.class_join_requests
  where class_id = v_class.id and student_id = v_me;

  if v_status = 'vantar' then
    return jsonb_build_object(
      'status', 'vantar',
      'class_id', v_class.id,
      'class_name', v_class.name,
      'message', 'Din ansökan väntar redan på din lärares godkännande.'
    );
  end if;

  insert into public.class_join_requests (class_id, student_id, status, requested_at, decided_by, decided_at)
  values (v_class.id, v_me, 'vantar', now(), null, null)
  on conflict (class_id, student_id)
    do update set status = 'vantar', requested_at = now(), decided_by = null, decided_at = null;

  perform public.log_audit('class.join_requested', 'class', v_class.id::text);

  return jsonb_build_object(
    'status', 'vantar',
    'class_id', v_class.id,
    'class_name', v_class.name,
    'message', 'Ansökan är skickad. Din lärare behöver godkänna den innan du ser klassens innehåll.'
  );
end;
$$;
