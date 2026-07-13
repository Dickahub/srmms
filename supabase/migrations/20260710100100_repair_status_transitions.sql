-- Enforce the repair lifecycle server-side, independent of the UI:
--   pending -> diagnosed -> in_progress -> awaiting_parts -> completed -> delivered
-- cancelled is reachable from any non-delivered, non-cancelled status; delivered is
-- reachable only from completed and is terminal (cannot be cancelled or reopened).
CREATE OR REPLACE FUNCTION public.tg_check_repair_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
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

CREATE TRIGGER trg_repairs_status_transition
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.tg_check_repair_status_transition();
