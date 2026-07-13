-- Technicians keep UPDATE on repairs (status transitions, repair logs,
-- assignment self-take, custody retrieve/place all depend on it — see the
-- "Admin/Receptionist/Technician can update repairs" RLS policy, unchanged).
-- The Edit page is hidden from Technicians in the UI, but that alone doesn't
-- stop a direct API call — this guard rejects a Technician changing repair
-- "metadata" (title, description, priority, due date, or the client/machine
-- links) at the database level too, mirroring trg_repairs_assignment_guard's
-- pattern for a single-purpose column-level restriction RLS can't express.
CREATE OR REPLACE FUNCTION public.tg_repairs_metadata_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist') THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
  THEN
    RAISE EXCEPTION 'Technicians cannot edit repair metadata (title, description, priority, due date, client, or machine)';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_metadata_guard
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_repairs_metadata_guard();
