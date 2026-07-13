-- Extends tg_check_repair_status_transition (20260710100100) with a role
-- restriction on WHO may change a repair's status, on top of the existing
-- valid-transition sequence checks (unchanged below): Technicians perform all
-- status transitions; Receptionist may only confirm delivery (via the
-- delivery-confirmation flow); Admin performs no status changes at all.
-- Repairs' UPDATE RLS policy (Admin/Receptionist/Technician) is unchanged —
-- this is enforced here, not by revoking table-level UPDATE.
CREATE OR REPLACE FUNCTION public.tg_check_repair_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'Admin') THEN
    RAISE EXCEPTION 'Admins cannot change repair status';
  END IF;

  IF NEW.status = 'delivered' THEN
    IF NOT (public.has_role(auth.uid(), 'Receptionist') OR public.has_role(auth.uid(), 'Technician')) THEN
      RAISE EXCEPTION 'Only a Receptionist or Technician can confirm delivery';
    END IF;
  ELSIF NOT public.has_role(auth.uid(), 'Technician') THEN
    RAISE EXCEPTION 'Only a Technician can change repair status';
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF OLD.status = 'delivered' THEN
      RAISE EXCEPTION 'Cannot cancel a delivered repair';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending'        AND NEW.status = 'diagnosed') OR
    (OLD.status = 'diagnosed'      AND NEW.status = 'in_progress') OR
    (OLD.status = 'in_progress'    AND NEW.status = 'awaiting_parts') OR
    (OLD.status = 'awaiting_parts' AND NEW.status = 'completed') OR
    (OLD.status = 'completed'      AND NEW.status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'Invalid repair status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;
