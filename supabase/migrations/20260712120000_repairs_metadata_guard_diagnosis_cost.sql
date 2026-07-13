-- Extends tg_repairs_metadata_guard (20260712110000) with two more field-level
-- rules, on top of the existing title/description/priority/due_date/client_id/
-- machine_id restriction (Admin/Receptionist only, unchanged below):
--
--  - diagnosis/resolution are the assigned technician's professional
--    conclusions: only the technician currently assigned to the repair may
--    set them — not Admin, not Receptionist, not any other technician. This
--    check is by identity (auth.uid() = assigned_to), not role, so it's
--    intentionally separate from the Admin/Receptionist bypass below.
--  - cost is Admin/Receptionist only, same as the original metadata fields.
CREATE OR REPLACE FUNCTION public.tg_repairs_metadata_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_admin_or_reception boolean;
BEGIN
  v_is_admin_or_reception := public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist');

  IF NOT v_is_admin_or_reception THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.priority IS DISTINCT FROM OLD.priority
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
    THEN
      RAISE EXCEPTION 'Technicians cannot edit repair metadata (title, description, priority, due date, client, or machine)';
    END IF;
  END IF;

  IF (NEW.diagnosis IS DISTINCT FROM OLD.diagnosis OR NEW.resolution IS DISTINCT FROM OLD.resolution)
    AND auth.uid() IS DISTINCT FROM OLD.assigned_to
  THEN
    RAISE EXCEPTION 'Only the assigned technician can edit the diagnosis or resolution';
  END IF;

  IF NEW.cost IS DISTINCT FROM OLD.cost AND NOT v_is_admin_or_reception THEN
    RAISE EXCEPTION 'Only an Admin or Receptionist can edit the repair cost';
  END IF;

  RETURN NEW;
END;
$$;
