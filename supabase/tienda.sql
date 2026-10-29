-- ============================================================================================
-- Salvando Otare: TIENDA y CapoCoins
-- Pegar ENTERO en Supabase → SQL Editor → New query → Run (después de schema.sql). Se puede repetir.
--
-- Protección: el saldo (capocoins) y los objetos (items) NO los puede escribir el juego directamente;
-- solo cambian con las funciones de abajo, que comprueban precios, saldo y límites en el servidor.
-- ============================================================================================

alter table public.progress add column if not exists capocoins     int         not null default 0;
alter table public.progress add column if not exists items         jsonb       not null default '{}'::jsonb; -- {"speed": true} = comprado y activo
alter table public.progress add column if not exists last_coins_at timestamptz;

alter table public.progress drop constraint if exists capocoins_no_negativo;
alter table public.progress add constraint capocoins_no_negativo check (capocoins >= 0);

-- El juego solo puede escribir directamente estas columnas (kills, mejor ronda, IA entrenada).
-- (user_id también, porque el guardado usa upsert; las reglas RLS impiden ponerle el de otra cuenta)
revoke insert, update on public.progress from anon, authenticated;
grant insert (user_id, kills, best_round, trained_ai, updated_at) on public.progress to authenticated;
grant update (user_id, kills, best_round, trained_ai, updated_at) on public.progress to authenticated;

-- Precios (los manda el servidor, no el juego)
create or replace function public.item_price(item text)
returns int
language sql
immutable
as $$
  select case item
    when 'speed'    then 200   -- X2 Velocidad
    when 'strength' then 300   -- X2 Fuerza
    when 'health'   then 500   -- X2 Vida
    when 'armor'    then 800   -- Armadura
    when 'coinsx2'  then 675   -- X2 Monedas
    when 'bonkchanti' then 1250 -- ayudante BonkChanti
    when 'otarin'   then 1850  -- ayudante Otarin
    when 'guille'   then 2500  -- ayudante Guille
    when 'nico'     then 6250  -- ayudante Nico's Power
  end;
$$;

-- Sumar las CapoCoins ganadas en una partida. Máximo 3000 por envío y un envío cada 15 segundos.
create or replace function public.add_capocoins(amount int)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  balance int;
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if amount is null or amount < 1 or amount > 3000 then raise exception 'cantidad_invalida'; end if;

  update progress
     set capocoins = capocoins + amount, last_coins_at = now(), updated_at = now()
   where user_id = uid
     and (last_coins_at is null or last_coins_at < now() - interval '15 seconds')
  returning capocoins into balance;

  if balance is null then raise exception 'demasiado_pronto'; end if;
  return balance;
end;
$$;

-- Comprar un objeto: comprueba precio, saldo y que no lo tengas ya. Devuelve el saldo y los objetos.
create or replace function public.buy_item(item text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  price int := public.item_price(item);
  coins int;
  owned jsonb;
begin
  if uid is null then raise exception 'sin_sesion'; end if;
  if price is null then raise exception 'objeto_desconocido'; end if;

  select capocoins, items into coins, owned from progress where user_id = uid for update;
  if owned ? item then raise exception 'ya_comprado'; end if;
  if coins < price then raise exception 'sin_saldo'; end if;

  update progress
     set capocoins = capocoins - price, items = items || jsonb_build_object(item, true), updated_at = now()
   where user_id = uid
  returning capocoins, items into coins, owned;

  return jsonb_build_object('capocoins', coins, 'items', owned);
end;
$$;

-- Activar / desactivar un objeto ya comprado
create or replace function public.set_item_active(item text, active boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owned jsonb;
begin
  if uid is null then raise exception 'sin_sesion'; end if;

  update progress
     set items = jsonb_set(items, array[item], to_jsonb(active)), updated_at = now()
   where user_id = uid and items ? item
  returning items into owned;

  if owned is null then raise exception 'no_comprado'; end if;
  return owned;
end;
$$;

-- Solo los jugadores con sesión pueden usar estas funciones
revoke execute on function public.add_capocoins(int)              from public, anon;
revoke execute on function public.buy_item(text)                  from public, anon;
revoke execute on function public.set_item_active(text, boolean)  from public, anon;
grant  execute on function public.add_capocoins(int)              to authenticated;
grant  execute on function public.buy_item(text)                  to authenticated;
grant  execute on function public.set_item_active(text, boolean)  to authenticated;
