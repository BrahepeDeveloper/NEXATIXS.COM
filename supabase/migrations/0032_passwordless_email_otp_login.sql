-- Reemplaza el login por contraseña + TOTP (app autenticadora) por login
-- passwordless: correo + código de un solo uso de 6 dígitos (Supabase Auth
-- "email OTP" nativo: auth.signInWithOtp / auth.verifyOtp), tanto para
-- clientes como para staff/superadmin. Aplica a TODAS las cuentas por
-- decisión explícita del negocio, confirmada sabiendo el trade-off de
-- seguridad que esto implica (ver nota abajo).
--
-- Cambio de seguridad importante: 0025_mfa_enforcement.sql endureció
-- is_staff()/is_super_admin()/is_admin_operativo_or_above() para exigir
-- aal2 (sesión con 2FA TOTP ya verificado) ademas de la membresia en
-- staff_users, cerrando un hueco real donde una sesion aal1 podia leer
-- todos los datos de clientes via la API de Supabase directamente. El
-- login por codigo de correo nunca eleva la sesion a aal2 (Supabase no
-- reconoce un codigo de correo como factor MFA), asi que esa comprobacion
-- quedaria bloqueando a TODO el staff para siempre si no se revierte.
-- Esta migracion revierte esa comprobacion a lo que era antes de 0025
-- (solo existencia en staff_users / rol), por decision explicita del
-- negocio de simplificar el login a cambio de esa capa extra de defensa.

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_staff_account();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff_users where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.is_admin_operativo_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff_users
    where id = auth.uid() and role in ('super_admin', 'admin_operativo')
  );
$$;
