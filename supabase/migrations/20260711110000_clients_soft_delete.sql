-- Client lifecycle: archive (soft delete) instead of a hard DELETE whenever a
-- client has repair history, since repairs.client_id/machines.client_id are
-- ON DELETE RESTRICT/CASCADE and a hard delete used to surface a raw FK error.

ALTER TABLE public.clients ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX clients_is_active_idx ON public.clients (is_active);

-- repairs.client_id is a direct FK to clients, separate from the
-- repairs.machine_id -> machines.client_id path. Both exist on purpose:
-- machine_id is nullable (machine-less intake), so client_id is the only
-- reliable link in that case and can't simply be dropped in favor of the
-- machine path. Keep both, but guarantee they can never disagree: whenever a
-- repair has a machine attached, force client_id to that machine's owner.
CREATE OR REPLACE FUNCTION public.tg_repairs_sync_client_from_machine()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.machine_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.machines WHERE id = NEW.machine_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_sync_client_from_machine
  BEFORE INSERT OR UPDATE ON public.repairs
  FOR EACH ROW
  WHEN (NEW.machine_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_repairs_sync_client_from_machine();

-- Archiving/reactivating (is_active toggle) is narrower than the general
-- Admin/Receptionist update policy on clients — Admin only. RLS can't
-- restrict a single column, so enforce it here (same pattern as
-- tg_repairs_assignment_guard). Other column edits are unaffected.
CREATE OR REPLACE FUNCTION public.tg_clients_archive_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'Admin') THEN
    RAISE EXCEPTION 'Only an Admin can archive or reactivate a client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clients_archive_guard
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.tg_clients_archive_guard();

-- Hard delete must never succeed while repair history exists (archive
-- instead) — enforced here so the rule holds regardless of what the UI does.
-- Checked via both paths even though the sync trigger above keeps them
-- consistent, as a defense-in-depth backstop.
CREATE OR REPLACE FUNCTION public.tg_clients_prevent_delete_with_repairs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.repairs r
   WHERE r.client_id = OLD.id
      OR r.machine_id IN (SELECT id FROM public.machines WHERE client_id = OLD.id);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'This client has repair history — use Archive instead.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_clients_prevent_delete_with_repairs
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_clients_prevent_delete_with_repairs();

-- machines.client_id is already ON DELETE CASCADE (see the clients/machines
-- migration) — a client with zero repairs but existing machines will have
-- those machines deleted automatically when the client row is deleted.
