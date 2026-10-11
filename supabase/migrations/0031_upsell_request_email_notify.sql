-- Las cotizaciones/solicitudes que un cliente hace desde el portal
-- (UpsellRequestButton, RenewLicenseButton -> tabla upsell_requests) ya
-- llegaban al panel admin (admin/clientes/[id]), pero nunca generaban una
-- notificacion por correo al equipo. Sigue el mismo patron que
-- 0019_support_tickets_and_email_notify.sql: trigger AFTER INSERT + pg_net
-- + Edge Function `notify-email` (tipo nuevo "upsell_request").

create or replace function public._notify_upsell_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify_email('upsell_request', new.id);
  return new;
end;
$$;

create trigger trg_notify_upsell_request
  after insert on public.upsell_requests
  for each row execute function public._notify_upsell_request();
