-- Fix tg_notify_repair(): it referenced NEW.repair_number / NEW.issue_description,
-- but the repairs table columns are order_number / description. That mismatch made
-- the trigger raise "record "new" has no field "repair_number"" on every insert or
-- status/assignment update of an assigned repair. Recreate with the real column names.
CREATE OR REPLACE FUNCTION public.tg_notify_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := '/repairs/' || NEW.id::text;
BEGIN
  -- Notify newly assigned technician
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'New repair assigned: ' || NEW.order_number,
            COALESCE(NEW.description, ''), v_link);
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'Repair assigned to you: ' || NEW.order_number,
            COALESCE(NEW.description, ''), v_link);
  END IF;

  -- Notify assignee on status change
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'status',
            'Repair ' || NEW.order_number || ' → ' || NEW.status,
            NULL, v_link);
  END IF;

  RETURN NEW;
END;
$$;
