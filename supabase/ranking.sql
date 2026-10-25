-- ============================================================================================
-- Salvando Otare: GLOBAL RANKS (ranking de todos los jugadores)
-- Pegar ENTERO en Supabase → SQL Editor → New query → Run (después de schema.sql y tienda.sql).
-- Se puede ejecutar más de una vez.
--
-- Las reglas RLS no dejan leer el progreso de otros jugadores, y así sigue. Esta función es la única
-- puerta: devuelve SOLO el nombre de usuario y el número de cada categoría (nunca correos ni nada más).
-- ============================================================================================

-- (la ronda de supervivencia la crea misiones.sql; por si este se ejecuta antes)
alter table public.progress add column if not exists best_survival int not null default 0;

create or replace function public.global_ranks(top_n int default 10)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  n   int := least(greatest(coalesce(top_n, 10), 1), 50);
  uid uuid := auth.uid();
  result jsonb;
begin
  with base as (
    select g.user_id, p.username,
           -- solo números enteros razonables (si alguien guarda algo raro, cuenta como 0)
           case when jsonb_typeof(g.kills->'Lanzziano') = 'number'
                then least(greatest(floor((g.kills->>'Lanzziano')::numeric), 0), 10000000)::bigint else 0 end as lanzziano,
           case when jsonb_typeof(g.kills->'Jhoabxi') = 'number'
                then least(greatest(floor((g.kills->>'Jhoabxi')::numeric), 0), 10000000)::bigint else 0 end as jhoabxi,
           g.capocoins::bigint as coins,
           g.best_survival::bigint as survival
      from progress g
      join profiles p on p.id = g.user_id
  ),
  cats(cat) as (values ('lanzziano'), ('jhoabxi'), ('coins'), ('survival')),
  vals as (
    select c.cat, b.user_id, b.username,
           case c.cat when 'lanzziano' then b.lanzziano when 'jhoabxi' then b.jhoabxi
                      when 'survival' then b.survival else b.coins end as value
      from base b cross join cats c
  ),
  ranked as (
    select v.*, rank() over (partition by v.cat order by v.value desc) as pos,
           row_number() over (partition by v.cat order by v.value desc, lower(v.username)) as rn
      from vals v
     where v.value > 0
  )
  select jsonb_build_object(
    'top', (
      select jsonb_object_agg(c.cat, coalesce((
        select jsonb_agg(jsonb_build_object('pos', r.pos, 'user', r.username, 'value', r.value) order by r.rn)
          from ranked r where r.cat = c.cat and r.rn <= n
      ), '[]'::jsonb))
        from cats c
    ),
    -- la posición del que pregunta (si tiene sesión y algo en esa categoría)
    'me', (
      select coalesce(jsonb_object_agg(r.cat, jsonb_build_object('pos', r.pos, 'value', r.value)), '{}'::jsonb)
        from ranked r where uid is not null and r.user_id = uid
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.global_ranks(int) from public;
grant  execute on function public.global_ranks(int) to anon, authenticated;
