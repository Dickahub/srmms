-- Server-side dispatch for email notifications. Previously the browser called
-- send-notification-email client-side after a status change succeeded — fragile
-- (dead if the tab closes immediately, and silently broken while CORS wasn't
-- configured on the function). This moves dispatch into the database itself via
-- pg_net, so it fires reliably whenever a qualifying row is inserted, regardless
-- of what happens in the browser.
--
-- SETUP REQUIRED (see README.md "Email notifications (Resend)" for the full
-- writeup) — run this once against the linked project, NOT part of this
-- migration since it contains live secrets that must never be committed:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- Until those two Vault secrets exist, the trigger below no-ops with a RAISE
-- WARNING (visible in Postgres logs) rather than failing the insert.
create extension if not exists pg_net;

create or replace function public.tg_send_email_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url  text;
  v_service_key  text;
begin
  select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_service_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_project_url is null or v_service_key is null then
    raise warning 'tg_send_email_notification: project_url/service_role_key not set in Vault — skipping dispatch for notification %', new.id;
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_project_url || '/functions/v1/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'notificationId', new.id,
        'recipient', new.recipient,
        'title', new.title,
        'body', new.body
      )
    );
  exception when others then
    -- Fire-and-forget: a dispatch failure must never block or roll back the
    -- insert that created this row (itself part of a repair status change).
    -- net.http_post is async and non-blocking on its own, but this still
    -- guards against it throwing synchronously (e.g. malformed URL).
    raise warning 'tg_send_email_notification: net.http_post failed for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger trg_send_email_notification
  after insert on public.notifications
  for each row
  when (new.channel = 'email' and new.delivery_status is null)
  execute function public.tg_send_email_notification();
