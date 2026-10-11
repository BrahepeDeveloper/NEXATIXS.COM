-- Soporte para el nuevo flujo passwordless (correo + código OTP) y el
-- autorregistro público de clientes:
--   1. Amplía los scopes permitidos en auth_rate_limits (0026) para cubrir
--      la solicitud/verificación de código y el registro.
--   2. Amplía los eventos permitidos en auth_audit_log (0027) para los
--      mismos flujos.
-- Los límites en sí (ventana/máximo de intentos) se pasan desde la ruta de
-- servidor, igual que login/mfa_verify ya hacían — aquí solo se habilitan
-- los nuevos valores de scope/event.
--
-- 'recovery_code' / 'recovery_codes_generated' / 'recovery_code_failed' /
-- 'recovery_code_used' ya existían como datos reales en producción (de la
-- función redeem_recovery_code, que no estaba en ningún archivo de
-- migración versionado en este repo — deuda previa, no introducida aquí)
-- y hay que conservarlos en el check o la migración falla contra la base
-- real por violar el constraint con filas existentes.

alter table public.auth_rate_limits drop constraint if exists auth_rate_limits_scope_check;
alter table public.auth_rate_limits add constraint auth_rate_limits_scope_check
  check (scope in ('login', 'mfa_verify', 'recovery_code', 'login_otp', 'verify_otp', 'register'));

alter table public.auth_audit_log drop constraint if exists auth_audit_log_event_check;
alter table public.auth_audit_log add constraint auth_audit_log_event_check
  check (event in (
    'login_success', 'login_failure',
    'mfa_verify_success', 'mfa_verify_failure',
    'logout', 'revoke_all_sessions',
    'recovery_codes_generated', 'recovery_code_failed', 'recovery_code_used',
    'otp_requested', 'otp_verify_success', 'otp_verify_failure',
    'client_registered'
  ));
