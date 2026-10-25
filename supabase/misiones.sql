-- ============================================================================================
-- Salvando Otare: MISIONES y modo SUPERVIVENCIA
-- Pegar ENTERO en Supabase → SQL Editor → New query → Run (después de schema.sql y tienda.sql).
-- Se puede ejecutar más de una vez.
--
-- Las recompensas de las misiones solo se cobran con claim_mission(), que comprueba en el servidor
-- que la misión está cumplida y que no se cobró antes. La lista de misiones es la MISMA que la de
-- src/js/misiones.js: si cambias una, cambia las dos.
-- ============================================================================================

alter table public.progress add column if not exists best_survival int   not null default 0;  -- ronda más alta en supervivencia
alter table public.progress add column if not exists wins          int   not null default 0;  -- veces que venció al jefe (modo normal)
alter table public.progress add column if not exists missions      jsonb not null default '{}'::jsonb; -- {"lanz40": "fecha"} = cobrada

-- El juego puede escribir directamente estas columnas (como antes, más best_survival y wins);
-- capocoins, items y missions solo cambian con las funciones del servidor.
revoke insert, update on public.progress from anon, authenticated;
grant insert (user_id, kills, best_round, trained_ai, updated_at, best_survival, wins) on public.progress to authenticated;
grant update (user_id, kills, best_round, trained_ai, updated_at, best_survival, wins) on public.progress to authenticated;

-- Catálogo de misiones: qué se mide, cuánto hace falta y cuántas CapoCoins da
create or replace function public.mission_info(mid text, out kind text, out goal int, out reward int)
language sql
immutable
as $$
  select m.kind, m.goal, m.reward from (values
    ('ronda15',   'round',     15,   100),
    ('lanz40',    'lanzziano', 40,   120),
    ('lanz260',   'lanzziano', 260,  500),
    ('lanz1000',  'lanzziano', 1000, 1399),
    ('lanz2000',  'lanzziano', 2000, 2345),
    ('jhoab40',   'jhoabxi',   40,   100),
    ('jhoab260',  'jhoabxi',   260,  400),
    ('jhoab1000', 'jhoabxi',   1000, 1399),
    ('jhoab2000', 'jhoabxi',   2000, 2345),
    ('ganador',   'wins',      1,    600),
    ('superv21',  'survival',  21,   601),
    ('superv60',  'survival',  60,   1050),
    ('superv100', 'survival',  100,  1500),
    ('comprador', 'items',     1,    300),
    ('acurar',    'bonkchanti', 1,   490),
    ('loteria',   'items',     4,    2000)
  ) as m(id, kind, goal, reward)
  where m.id = mid;
$$;

-- Cobrar una misión. Devuelve el saldo nuevo y las misiones cobradas.
create or replace function public.claim_mission(mid text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  info record;
  pr progress%rowtype;
  val bigint;
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  select * into info from public.mission_info(mid);
  if info.kind is null then raise exception 'mision_desconocida'; end if;

  select * into pr from progress where user_id = uid for update;
  if not found then raise exception 'sin_progreso'; end if;
  if pr.missions ? mid then raise exception 'ya_cobrada'; end if;

  val := case info.kind
    when 'round'     then pr.best_round
    when 'survival'  then pr.best_survival
    when 'wins'      then pr.wins
    when 'items'     then (select count(*) from jsonb_object_keys(pr.items))
    when 'bonkchanti' then case when pr.items ? 'bonkchanti' then 1 else 0 end
    when 'lanzziano' then case when jsonb_typeof(pr.kills->'Lanzziano') = 'number' then floor((pr.kills->>'Lanzziano')::numeric) else 0 end
    when 'jhoabxi'   then case when jsonb_typeof(pr.kills->'Jhoabxi')   = 'number' then floor((pr.kills->>'Jhoabxi')::numeric)   else 0 end
    else 0 end;
  if val < info.goal then raise exception 'no_cumplida'; end if;

  update progress
     set capocoins = capocoins + info.reward,
         missions = missions || jsonb_build_object(mid, now()),
         updated_at = now()
   where user_id = uid
  returning * into pr;

  return jsonb_build_object('capocoins', pr.capocoins, 'missions', pr.missions, 'reward', info.reward);
end;
$$;

revoke execute on function public.claim_mission(text) from public, anon;
grant  execute on function public.claim_mission(text) to authenticated;
