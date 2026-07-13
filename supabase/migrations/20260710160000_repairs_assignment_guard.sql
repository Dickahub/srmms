-- Only Admin/Receptionist may assign or reassign a repair to a technician. A
-- Technician (or anyone lacking both those roles) may only self-assign a
-- currently-unassigned repair (old assigned_to null, new assigned_to = themself)
-- — never reassign an already-assigned repair, and never assign someone else.
-- RLS can't restrict a single column, so this is enforced here instead.
CREATE OR REPLACE FUNCTION public.tg_repairs_assignment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist') THEN
    RETURN NEW;
  END IF;

  IF NOT (OLD.assigned_to IS NULL AND NEW.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'Technicians may only self-assign an unassigned repair';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_assignment_guard
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.tg_repairs_assignment_guard();
