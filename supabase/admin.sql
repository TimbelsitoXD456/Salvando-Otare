-- ============================================================================================
-- Salvando Otare: marcar TU cuenta como admin (verás SIMULACIONES: simulación, predicción, entrenamiento)
--
-- 1. Regístrate primero en el juego con tu correo y confírmalo.
-- 2. Cambia TU_CORREO_AQUI por tu correo, pega esto en Supabase → SQL Editor y dale a Run.
-- 3. En el juego, cierra sesión y vuelve a entrar (la marca viaja en la sesión).
--
-- La marca va en app_metadata: ningún jugador puede ponérsela a sí mismo, solo se cambia desde aquí.
-- Tu correo queda solo en Supabase, no en el código del juego.
-- ============================================================================================

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where lower(email) = lower('TU_CORREO_AQUI');

-- Comprobar: debe salir tu correo con role = admin
select email, raw_app_meta_data->>'role' as role
from auth.users
where raw_app_meta_data->>'role' = 'admin';
