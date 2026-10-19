-- ============================================================================================
-- Salvando Otare: cuentas y progreso en Supabase
-- Pegar ENTERO en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.
--
-- Las contraseñas NO están aquí: las guarda Supabase Auth (auth.users), cifradas con hash.
-- Estas tablas guardan el usuario visible y el progreso, enlazados a la cuenta de Auth.
-- ============================================================================================

-- Perfil público de cada jugador: usuario y correo, los dos únicos (sin distinguir mayúsculas)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  email      text not null,
  created_at timestamptz not null default now(),
  constraint username_formato check (username ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index if not exists profiles_username_unico on public.profiles (lower(username));
create unique index if not exists profiles_email_unico    on public.profiles (lower(email));

-- Progreso de cada jugador
create table if not exists public.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  kills      jsonb not null default '{}'::jsonb,   -- {"Lanzziano": 12, "Jhoabxi": 30}
  best_round int   not null default 0,             -- ronda más alta alcanzada jugando de verdad
  trained_ai jsonb,                                 -- IA entrenada guardada (solo la usa el admin)
  updated_at timestamptz not null default now()
);

-- Seguridad: cada jugador solo puede ver y tocar SU fila
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

drop policy if exists "perfil propio: leer" on public.profiles;
create policy "perfil propio: leer" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "progreso propio: leer" on public.progress;
create policy "progreso propio: leer" on public.progress
  for select using (auth.uid() = user_id);

drop policy if exists "progreso propio: crear" on public.progress;
create policy "progreso propio: crear" on public.progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "progreso propio: actualizar" on public.progress;
create policy "progreso propio: actualizar" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Al registrarse alguien: crear su perfil (con el usuario que eligió) y su fila de progreso.
-- Si el usuario o el correo ya existen, el registro falla y no se crea la cuenta.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'jugador_' || substr(new.id::text, 1, 8)),
    new.email
  );
  insert into public.progress (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿Está libre este usuario? (el juego lo pregunta antes de registrar; no revela nada más)
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;
